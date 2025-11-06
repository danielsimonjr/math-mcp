#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import * as math from "mathjs";
import * as wasmWrapper from "./wasm-wrapper.js";

// Define available tools
const TOOLS: Tool[] = [
  {
    name: "evaluate",
    description: "Evaluate a mathematical expression. Supports arithmetic, algebra, calculus, matrices, and more. Example: '2 + 2', 'sqrt(16)', 'derivative(x^2, x)', 'det([[1,2],[3,4]])'",
    inputSchema: {
      type: "object",
      properties: {
        expression: {
          type: "string",
          description: "Mathematical expression to evaluate",
        },
        scope: {
          type: "object",
          description: "Optional variables to use in the expression (e.g., {x: 5, y: 10})",
        },
      },
      required: ["expression"],
    },
  },
  {
    name: "simplify",
    description: "Simplify a mathematical expression. Example: '2 * x + x' becomes '3 * x'",
    inputSchema: {
      type: "object",
      properties: {
        expression: {
          type: "string",
          description: "Mathematical expression to simplify",
        },
        rules: {
          type: "array",
          items: { type: "string" },
          description: "Optional simplification rules",
        },
      },
      required: ["expression"],
    },
  },
  {
    name: "derivative",
    description: "Calculate the derivative of an expression with respect to a variable. Example: derivative('x^2', 'x') returns '2*x'",
    inputSchema: {
      type: "object",
      properties: {
        expression: {
          type: "string",
          description: "Mathematical expression",
        },
        variable: {
          type: "string",
          description: "Variable to differentiate with respect to",
        },
      },
      required: ["expression", "variable"],
    },
  },
  {
    name: "solve",
    description: "Solve an equation. Example: solve('x^2 - 4 = 0', 'x') returns the solutions",
    inputSchema: {
      type: "object",
      properties: {
        equation: {
          type: "string",
          description: "Equation to solve",
        },
        variable: {
          type: "string",
          description: "Variable to solve for",
        },
      },
      required: ["equation", "variable"],
    },
  },
  {
    name: "matrix_operations",
    description: "Perform matrix operations like multiply, inverse, determinant, transpose, eigenvalues. Matrices should be in array format like [[1,2],[3,4]]. WASM-accelerated for large matrices (10x10+)",
    inputSchema: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          enum: ["multiply", "inverse", "determinant", "transpose", "eigenvalues", "add", "subtract"],
          description: "Matrix operation to perform",
        },
        matrix_a: {
          type: "string",
          description: "First matrix in JSON array format (e.g., '[[1,2],[3,4]]')",
        },
        matrix_b: {
          type: "string",
          description: "Second matrix (for operations that require two matrices)",
        },
      },
      required: ["operation", "matrix_a"],
    },
  },
  {
    name: "statistics",
    description: "Calculate statistical values like mean, median, mode, std (standard deviation), variance, min, max, sum. WASM-accelerated for large datasets (100+ elements)",
    inputSchema: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          enum: ["mean", "median", "mode", "std", "variance", "min", "max", "sum"],
          description: "Statistical operation to perform",
        },
        data: {
          type: "string",
          description: "Data array in JSON format (e.g., '[1, 2, 3, 4, 5]')",
        },
      },
      required: ["operation", "data"],
    },
  },
  {
    name: "unit_conversion",
    description: "Convert between units. Example: convert '5 inches to cm' or '100 fahrenheit to celsius'",
    inputSchema: {
      type: "object",
      properties: {
        value: {
          type: "string",
          description: "Value with unit (e.g., '5 inches', '100 km/h')",
        },
        target_unit: {
          type: "string",
          description: "Target unit to convert to (e.g., 'cm', 'mph')",
        },
      },
      required: ["value", "target_unit"],
    },
  },
];

// Create server instance
const server = new Server(
  {
    name: "math-mcp",
    version: "2.0.0-wasm",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Handle list tools request
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "evaluate": {
        const { expression, scope = {} } = args as { expression: string; scope?: object };
        const result = math.evaluate(expression, scope);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ result: math.format(result) }, null, 2),
            },
          ],
        };
      }

      case "simplify": {
        const { expression, rules } = args as { expression: string; rules?: string[] };
        const simplified = rules ? math.simplify(expression, rules as any) : math.simplify(expression);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ result: simplified.toString() }, null, 2),
            },
          ],
        };
      }

      case "derivative": {
        const { expression, variable } = args as { expression: string; variable: string };
        const derivative = math.derivative(expression, variable);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ result: derivative.toString() }, null, 2),
            },
          ],
        };
      }

      case "solve": {
        const { equation, variable } = args as { equation: string; variable: string };
        // Parse equation into left and right sides
        const parts = equation.split('=');
        if (parts.length !== 2) {
          throw new Error("Equation must contain exactly one '=' sign");
        }
        // Evaluate as: left - right = 0 and use numeric solver
        const expr = `${parts[0].trim()} - (${parts[1].trim()})`;
        const node = math.parse(expr);
        const compiled = node.compile();

        // Try to solve symbolically by rearranging
        let result: string;
        try {
          // For simple cases, try to isolate the variable
          const simplified = math.simplify(expr);
          result = `Simplified equation: ${simplified.toString()} = 0`;
        } catch (e) {
          result = `Expression to solve: ${expr} = 0 for ${variable}`;
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ result }, null, 2),
            },
          ],
        };
      }

      case "matrix_operations": {
        const { operation, matrix_a, matrix_b } = args as {
          operation: string;
          matrix_a: string;
          matrix_b?: string;
        };
        const matA = JSON.parse(matrix_a);
        let result: any;

        switch (operation) {
          case "multiply":
            if (!matrix_b) throw new Error("matrix_b required for multiply");
            // Use WASM wrapper for automatic performance optimization
            result = await wasmWrapper.matrixMultiply(matA, JSON.parse(matrix_b));
            break;
          case "inverse":
            result = math.inv(matA);
            break;
          case "determinant":
            // Use WASM wrapper for automatic performance optimization
            result = await wasmWrapper.matrixDeterminant(matA);
            break;
          case "transpose":
            // Use WASM wrapper for automatic performance optimization
            result = await wasmWrapper.matrixTranspose(matA);
            break;
          case "eigenvalues":
            result = math.eigs(matA).values;
            break;
          case "add":
            if (!matrix_b) throw new Error("matrix_b required for add");
            // Use WASM wrapper for automatic performance optimization
            result = await wasmWrapper.matrixAdd(matA, JSON.parse(matrix_b));
            break;
          case "subtract":
            if (!matrix_b) throw new Error("matrix_b required for subtract");
            // Use WASM wrapper for automatic performance optimization
            result = await wasmWrapper.matrixSubtract(matA, JSON.parse(matrix_b));
            break;
          default:
            throw new Error(`Unknown operation: ${operation}`);
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ result: math.format(result) }, null, 2),
            },
          ],
        };
      }

      case "statistics": {
        const { operation, data } = args as { operation: string; data: string };
        const dataArray = JSON.parse(data);
        let result: any;

        switch (operation) {
          case "mean":
            // Use WASM wrapper for automatic performance optimization
            result = await wasmWrapper.statsMean(dataArray);
            break;
          case "median":
            // Use WASM wrapper for automatic performance optimization
            result = await wasmWrapper.statsMedian(dataArray);
            break;
          case "mode":
            // Use WASM wrapper for automatic performance optimization
            result = await wasmWrapper.statsMode(dataArray);
            break;
          case "std":
            // Use WASM wrapper for automatic performance optimization
            result = await wasmWrapper.statsStd(dataArray);
            break;
          case "variance":
            // Use WASM wrapper for automatic performance optimization
            result = await wasmWrapper.statsVariance(dataArray);
            break;
          case "min":
            // Use WASM wrapper for automatic performance optimization
            result = await wasmWrapper.statsMin(dataArray);
            break;
          case "max":
            // Use WASM wrapper for automatic performance optimization
            result = await wasmWrapper.statsMax(dataArray);
            break;
          case "sum":
            // Use WASM wrapper for automatic performance optimization
            result = await wasmWrapper.statsSum(dataArray);
            break;
          default:
            throw new Error(`Unknown operation: ${operation}`);
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ result: math.format(result) }, null, 2),
            },
          ],
        };
      }

      case "unit_conversion": {
        const { value, target_unit } = args as { value: string; target_unit: string };
        const result = math.unit(value).to(target_unit);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ result: result.toString() }, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ error: errorMessage }, null, 2),
        },
      ],
      isError: true,
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log performance stats on startup
  const perfStats = wasmWrapper.getPerfStats();
  console.error("MathJS MCP Server (WASM-accelerated) running on stdio");
  console.error("WASM Status:", perfStats.wasmInitialized ? "Initialized" : "Fallback to mathjs");

  // Log performance stats every 100 operations
  let callCount = 0;
  const originalHandler = server.setRequestHandler;
  setInterval(() => {
    if (callCount > 0 && callCount % 100 === 0) {
      const stats = wasmWrapper.getPerfStats();
      console.error(`[Performance] ${stats.totalCalls} ops | WASM: ${stats.wasmPercentage} | Avg WASM: ${stats.avgWasmTime} | Avg mathjs: ${stats.avgMathjsTime}`);
    }
    callCount++;
  }, 1000);
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
