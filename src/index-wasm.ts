#!/usr/bin/env node

/**
 * @file index-wasm.ts
 * @description Math MCP Server with WASM Acceleration
 *
 * This is the main entry point for the WASM-accelerated Math MCP Server.
 * It provides 7 mathematical tools with automatic performance optimization:
 *
 * **Tools:**
 * 1. evaluate - Evaluate mathematical expressions with variables
 * 2. simplify - Simplify algebraic expressions
 * 3. derivative - Calculate derivatives
 * 4. solve - Solve equations
 * 5. matrix_operations ⚡ - Matrix operations (WASM-accelerated for large matrices)
 * 6. statistics ⚡ - Statistical calculations (WASM-accelerated for large datasets)
 * 7. unit_conversion - Convert between units
 *
 * **Intelligent Acceleration (v3.0.0):**
 * - WebGPU: Up to 100x faster for massive operations (GPU-accelerated)
 * - WebWorkers: Up to 4x faster for large operations (multi-threaded)
 * - WASM: Up to 42x faster for medium operations (single-threaded)
 * - Automatic routing: Intelligently selects optimal acceleration layer
 * - Graceful fallback: GPU → Workers → WASM → mathjs
 *
 * **Security Features:**
 * - Input validation for all operations
 * - Size limits to prevent DoS attacks
 * - Timeout protection for long-running operations
 * - Comprehensive error handling
 *
 * @module index-wasm
 * @since 2.0.0
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  CallToolRequest,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { accelerationAdapter } from "./acceleration-adapter.js";
import { getRoutingStats } from "./acceleration-router.js";
import {
  handleEvaluate,
  handleSimplify,
  handleDerivative,
  handleSolve,
  handleMatrixOperations,
  handleStatistics,
  handleUnitConversion,
  withErrorHandling,
  AccelerationWrapper,
} from "./tool-handlers.js";
import { logger, getPackageVersion, perfTracker } from "./utils.js";
import { MathMCPError } from "./errors.js";

/**
 * Available mathematical tools exposed by the MCP server.
 *
 * Each tool has:
 * - name: Unique identifier
 * - description: Human-readable explanation
 * - inputSchema: JSON Schema defining required/optional parameters
 *
 * @constant
 * @type {Tool[]}
 */
const TOOLS: Tool[] = [
  {
    name: "evaluate",
    description:
      "Evaluate a mathematical expression. Supports arithmetic, algebra, calculus, matrices, and more. Example: '2 + 2', 'sqrt(16)', 'derivative(x^2, x)', 'det([[1,2],[3,4]])'",
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
    description:
      "Calculate the derivative of an expression with respect to a variable. Example: derivative('x^2', 'x') returns '2*x'",
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
    description:
      "Perform matrix operations like multiply, inverse, determinant, transpose, eigenvalues. Matrices should be in array format like [[1,2],[3,4]]. WASM-accelerated for large matrices (10x10+)",
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
    description:
      "Calculate statistical values like mean, median, mode, std (standard deviation), variance, min, max, sum. WASM-accelerated for large datasets (100+ elements)",
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

/**
 * Creates and configures the MCP server instance.
 *
 * Server configuration:
 * - Name: math-mcp
 * - Version: Dynamically loaded from package.json
 * - Capabilities: tools (provides mathematical tools)
 *
 * @returns {Promise<Server>} Configured MCP server instance
 */
async function createServer(): Promise<Server> {
  const version = await getPackageVersion();

  const server = new Server(
    {
      name: "math-mcp",
      version: version,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  logger.info("MCP Server created", { version });

  return server;
}

/**
 * Registers request handlers for the MCP server.
 *
 * Handles two types of requests:
 * 1. ListTools - Returns the list of available tools
 * 2. CallTool - Executes a specific tool with given arguments
 *
 * @param {Server} server - The MCP server instance to register handlers on
 */
function registerHandlers(server: Server): void {
  /**
   * Handler for listing available tools.
   * Returns the complete list of tools with their schemas.
   */
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    logger.debug("Listing tools", { count: TOOLS.length });
    return { tools: TOOLS };
  });

  /**
   * Handler for tool execution requests.
   * Routes requests to appropriate tool handlers with error handling.
   *
   * @param {CallToolRequest} request - The tool call request containing tool name and arguments
   * @returns {Promise<any>} The tool execution result or error
   */
  server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest): Promise<any> => {
    const { name, arguments: args } = request.params;

    logger.info("Tool called", { tool: name });

    try {
      // Route to appropriate handler based on tool name
      switch (name) {
        case "evaluate":
          return await withErrorHandling(handleEvaluate, args as {
            expression: string;
            scope?: object;
          });

        case "simplify":
          return await withErrorHandling(handleSimplify, args as {
            expression: string;
            rules?: string[];
          });

        case "derivative":
          return await withErrorHandling(handleDerivative, args as {
            expression: string;
            variable: string;
          });

        case "solve":
          return await withErrorHandling(handleSolve, args as {
            equation: string;
            variable: string;
          });

        case "matrix_operations":
          return await withErrorHandling(
            (params) => handleMatrixOperations(params, accelerationAdapter),
            args as {
              operation: string;
              matrix_a: string;
              matrix_b?: string;
            }
          );

        case "statistics":
          return await withErrorHandling(
            (params) => handleStatistics(params, accelerationAdapter),
            args as {
              operation: string;
              data: string;
            }
          );

        case "unit_conversion":
          return await withErrorHandling(handleUnitConversion, args as {
            value: string;
            target_unit: string;
          });

        default:
          throw new MathMCPError(`Unknown tool: ${name}`);
      }
    } catch (error) {
      logger.error("Tool execution failed", {
        tool: name,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  });

  logger.info("Request handlers registered");
}

/**
 * Logs performance statistics to the console.
 * Called periodically to monitor server performance.
 */
function logPerformanceStats(): void {
  const routingStats = getRoutingStats();
  const toolStats = perfTracker.getAllStats();

  logger.info("Performance stats", {
    acceleration: {
      totalOps: routingStats.totalOps,
      accelerationRate: routingStats.accelerationRate,
      mathjs: routingStats.mathjsUsage,
      wasm: routingStats.wasmUsage,
      workers: routingStats.workersUsage,
      gpu: routingStats.gpuUsage,
    },
    topOperations: Array.from(toolStats.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5)
      .map(([op, stats]) => ({
        operation: op,
        count: stats.count,
        avgTime: stats.avgTime.toFixed(3) + 'ms',
      })),
  });
}

/**
 * Main server startup function.
 *
 * Startup sequence:
 * 1. Create server instance
 * 2. Register request handlers
 * 3. Create transport (stdio)
 * 4. Connect server to transport
 * 5. Log startup information
 * 6. Set up periodic performance logging
 *
 * @returns {Promise<void>} Resolves when server is running
 */
async function main(): Promise<void> {
  try {
    // Create and configure server
    const server = await createServer();
    registerHandlers(server);

    // Create transport and connect
    const transport = new StdioServerTransport();
    await server.connect(transport);

    // Log startup info
    const perfStats = getRoutingStats();
    const version = await getPackageVersion();

    logger.info("MathJS MCP Server (Multi-tier Accelerated) running", {
      version,
      transport: "stdio",
      accelerationStatus: `${perfStats.accelerationRate} ops use acceleration`,
      tools: TOOLS.length,
    });

    // Set up periodic performance logging (every 5 minutes)
    if (process.env.ENABLE_PERF_LOGGING === 'true') {
      setInterval(logPerformanceStats, 5 * 60 * 1000);
    }
  } catch (error) {
    logger.error("Failed to start server", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  }
}

// Start the server
main().catch((error) => {
  logger.error("Fatal error in main()", {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  process.exit(1);
});
