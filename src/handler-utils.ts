/**
 * @file handler-utils.ts
 * @description Common handler utilities for reducing boilerplate in tool handlers
 *
 * @module handler-utils
 * @since 3.3.0
 */

import { logger, perfTracker } from './utils.js';
import { MathMCPError } from './errors.js';

/** Standard response format for tool handlers */
export interface ToolResponse {
  content: Array<{ type: string; text: string }>;
  isError: boolean;
}

/**
 * Creates a success response with formatted result.
 */
export function successResponse(result: unknown): ToolResponse {
  return {
    content: [{ type: 'text', text: JSON.stringify({ result }, null, 2) }],
    isError: false,
  };
}

/**
 * Creates an error response.
 */
export function errorResponse(error: unknown): ToolResponse {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorName = error instanceof MathMCPError ? error.name : 'Error';
  return {
    content: [{ type: 'text', text: JSON.stringify({ error: errorMessage, errorType: errorName }, null, 2) }],
    isError: true,
  };
}

/** Handler execution options */
export interface HandlerOptions {
  operationName: string;
  logContext?: Record<string, unknown>;
}

/**
 * Wraps a handler execution with timing, logging, and error handling.
 */
export async function executeHandler<T>(
  options: HandlerOptions,
  execute: () => Promise<T>
): Promise<T> {
  const startTime = performance.now();

  try {
    if (options.logContext) {
      logger.debug(`${options.operationName}`, options.logContext);
    }

    const result = await execute();

    perfTracker.recordOperation(options.operationName, performance.now() - startTime);
    return result;
  } catch (error) {
    perfTracker.recordOperation(`${options.operationName}_error`, performance.now() - startTime);
    logger.error(`${options.operationName} failed`, {
      ...options.logContext,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Wraps a handler with error handling to return ToolResponse.
 */
export async function withErrorHandling<T>(
  handler: (args: T) => Promise<ToolResponse>,
  args: T
): Promise<ToolResponse> {
  try {
    return await handler(args);
  } catch (error) {
    return errorResponse(error);
  }
}
