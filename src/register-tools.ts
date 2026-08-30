/**
 * @file register-tools.ts
 * @description Registers the seven math tools on an MCP v2 {@link McpServer}.
 */

import type { CallToolResult, McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { globalRateLimiter, withRateLimit } from "./rate-limiter.js";
import {
  handleEvaluate,
  handleSimplify,
  handleDerivative,
  handleSolve,
  handleMatrixOperations,
  handleStatistics,
  handleUnitConversion,
  withErrorHandling,
} from "./tool-handlers.js";

async function callTool<T>(
  handler: (args: T) => Promise<CallToolResult>,
  args: T
): Promise<CallToolResult> {
  return withRateLimit(globalRateLimiter, () => withErrorHandling(handler, args));
}

const matrixOperation = z.enum([
  "multiply",
  "inverse",
  "determinant",
  "transpose",
  "eigenvalues",
  "add",
  "subtract",
]);

const statisticsOperation = z.enum([
  "mean",
  "median",
  "mode",
  "std",
  "variance",
  "min",
  "max",
  "sum",
  "product",
]);

/** Registers all mathematical tools exposed by this server. */
export function registerMathTools(server: McpServer): void {
  server.registerTool(
    "evaluate",
    {
      description:
        "Evaluate a mathematical expression. Supports arithmetic, algebra, calculus, matrices, and more. Example: '2 + 2', 'sqrt(16)', 'derivative(x^2, x)', 'det([[1,2],[3,4]])'",
      inputSchema: z.object({
        expression: z.string().describe("Mathematical expression to evaluate"),
        scope: z
          .record(z.string(), z.number())
          .optional()
          .describe("Optional variables to use in the expression (e.g., {x: 5, y: 10})"),
      }),
    },
    async (args) => callTool(handleEvaluate, args)
  );

  server.registerTool(
    "simplify",
    {
      description: "Simplify a mathematical expression. Example: '2 * x + x' becomes '3 * x'",
      inputSchema: z.object({
        expression: z.string().describe("Mathematical expression to simplify"),
        rules: z.array(z.string()).optional().describe("Optional simplification rules"),
      }),
    },
    async (args) => callTool(handleSimplify, args)
  );

  server.registerTool(
    "derivative",
    {
      description:
        "Calculate the derivative of an expression with respect to a variable. Example: derivative('x^2', 'x') returns '2*x'",
      inputSchema: z.object({
        expression: z.string().describe("Mathematical expression"),
        variable: z.string().describe("Variable to differentiate with respect to"),
      }),
    },
    async (args) => callTool(handleDerivative, args)
  );

  server.registerTool(
    "solve",
    {
      description: "Solve an equation. Example: solve('x^2 - 4 = 0', 'x') returns the solutions",
      inputSchema: z.object({
        equation: z.string().describe("Equation to solve"),
        variable: z.string().describe("Variable to solve for"),
      }),
    },
    async (args) => callTool(handleSolve, args)
  );

  server.registerTool(
    "matrix_operations",
    {
      description:
        "Perform matrix operations like multiply, inverse, determinant, transpose, eigenvalues. Matrices should be in array format like [[1,2],[3,4]].",
      inputSchema: z.object({
        operation: matrixOperation.describe("Matrix operation to perform"),
        matrix_a: z
          .string()
          .describe("First matrix in JSON array format (e.g., '[[1,2],[3,4]]')"),
        matrix_b: z
          .string()
          .optional()
          .describe("Second matrix (for operations that require two matrices)"),
      }),
    },
    async (args) => callTool(handleMatrixOperations, args)
  );

  server.registerTool(
    "statistics",
    {
      description:
        "Calculate statistical values like mean, median, mode (returns array), std (standard deviation), variance, min, max, sum, product.",
      inputSchema: z.object({
        operation: statisticsOperation.describe(
          "Statistical operation to perform. Note: mode returns an array (single mode: [value], multiple modes: [value1, value2])"
        ),
        data: z.string().describe("Data array in JSON format (e.g., '[1, 2, 3, 4, 5]')"),
      }),
    },
    async (args) => callTool(handleStatistics, args)
  );

  server.registerTool(
    "unit_conversion",
    {
      description:
        "Convert between units. Example: convert '5 inches to cm' or '100 fahrenheit to celsius'",
      inputSchema: z.object({
        value: z.string().describe("Value with unit (e.g., '5 inches', '100 km/h')"),
        target_unit: z
          .string()
          .describe(
            "Target unit to convert to (e.g., 'cm', 'mi/h'). Use compound forms like 'mi/h' / 'km/h' for speed; 'mph'/'kph'/'knot' are not recognized (same as mathjs)."
          ),
      }),
    },
    async (args) => callTool(handleUnitConversion, args)
  );
}
