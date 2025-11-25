/**
 * @file utils.ts
 * @description Utility functions for the Math MCP Server
 *
 * This module provides common utility functions including:
 * - Timeout protection for async operations
 * - Logging configuration and helpers
 * - Performance monitoring utilities
 *
 * @module utils
 * @since 2.1.0
 */

import { TimeoutError } from './errors.js';

/**
 * Default timeout for mathematical operations (30 seconds).
 * Can be overridden via OPERATION_TIMEOUT environment variable.
 *
 * @constant
 * @type {number}
 */
export const DEFAULT_OPERATION_TIMEOUT = parseInt(
  process.env.OPERATION_TIMEOUT || '30000',
  10
);

/**
 * Wraps a promise with a timeout. If the promise doesn't resolve within
 * the specified time, it will be rejected with a TimeoutError.
 *
 * This prevents long-running operations from blocking the server indefinitely,
 * which could be exploited for denial-of-service attacks or simply hang due
 * to algorithmic complexity.
 *
 * @template T - The type of value the promise resolves to
 * @param {Promise<T>} promise - The promise to wrap with timeout protection
 * @param {number} timeoutMs - Timeout duration in milliseconds
 * @param {string} [operationName] - Optional name for the operation (for error messages)
 * @returns {Promise<T>} A promise that resolves with the original value or rejects with TimeoutError
 * @throws {TimeoutError} If the operation exceeds the timeout
 *
 * @example
 * ```typescript
 * const result = await withTimeout(
 *   slowOperation(),
 *   5000,
 *   'Matrix determinant calculation'
 * );
 * // If slowOperation() takes more than 5 seconds, throws TimeoutError
 *
 * try {
 *   await withTimeout(verySlowOperation(), 1000);
 * } catch (error) {
 *   if (error instanceof TimeoutError) {
 *     console.log('Operation timed out');
 *   }
 * }
 * ```
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName?: string
): Promise<T> {
  let timeoutHandle: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      const name = operationName ? ` (${operationName})` : '';
      reject(new TimeoutError(`Operation${name} exceeded timeout of ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutHandle!);
  }
}

/**
 * Log levels for the application.
 * Ordered from most to least severe.
 *
 * @enum {string}
 */
export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug',
}

/**
 * Current log level. Can be configured via LOG_LEVEL environment variable.
 * Defaults to 'info' in production, 'debug' in development.
 *
 * @constant
 * @type {LogLevel}
 */
const currentLogLevel: LogLevel =
  (process.env.LOG_LEVEL as LogLevel) ||
  (process.env.NODE_ENV === 'production' ? LogLevel.INFO : LogLevel.DEBUG);

/**
 * Map of log levels to their numeric priority.
 * Higher numbers = more verbose.
 *
 * @constant
 * @type {Record<LogLevel, number>}
 */
const logLevelPriority: Record<LogLevel, number> = {
  [LogLevel.ERROR]: 0,
  [LogLevel.WARN]: 1,
  [LogLevel.INFO]: 2,
  [LogLevel.DEBUG]: 3,
};

/**
 * Determines if a message at the given level should be logged.
 *
 * @param {LogLevel} level - The level to check
 * @returns {boolean} True if this level should be logged
 *
 * @example
 * ```typescript
 * shouldLog(LogLevel.DEBUG); // true if currentLogLevel is DEBUG
 * shouldLog(LogLevel.ERROR); // always true
 * ```
 */
function shouldLog(level: LogLevel): boolean {
  return logLevelPriority[level] <= logLevelPriority[currentLogLevel];
}

/**
 * Formats a log message with timestamp and level.
 *
 * @param {LogLevel} level - The log level
 * @param {string} message - The message to log
 * @param {Record<string, unknown>} [metadata] - Optional metadata to include
 * @returns {string} Formatted log message
 *
 * @example
 * ```typescript
 * formatLogMessage(LogLevel.INFO, 'Server started', { port: 3000 });
 * // Returns: "[2024-01-15T10:30:00.000Z] INFO: Server started { port: 3000 }"
 * ```
 */
function formatLogMessage(
  level: LogLevel,
  message: string,
  metadata?: Record<string, unknown>
): string {
  const timestamp = new Date().toISOString();
  const metaStr = metadata ? ' ' + JSON.stringify(metadata) : '';
  return `[${timestamp}] ${level.toUpperCase()}: ${message}${metaStr}`;
}

/**
 * Simple logger utility with log levels.
 * Uses appropriate streams: stderr for errors/warnings, stdout for info/debug.
 *
 * @constant
 * @type {Object}
 */
export const logger = {
  /**
   * Logs an error message. Always logged regardless of log level.
   * Outputs to stderr (console.error).
   *
   * @param {string} message - The error message
   * @param {Record<string, unknown>} [metadata] - Optional metadata
   *
   * @example
   * ```typescript
   * logger.error('Failed to parse matrix', { input: matrixStr });
   * ```
   */
  error(message: string, metadata?: Record<string, unknown>): void {
    if (shouldLog(LogLevel.ERROR)) {
      console.error(formatLogMessage(LogLevel.ERROR, message, metadata));
    }
  },

  /**
   * Logs a warning message.
   * Outputs to stderr (console.warn).
   *
   * @param {string} message - The warning message
   * @param {Record<string, unknown>} [metadata] - Optional metadata
   *
   * @example
   * ```typescript
   * logger.warn('WASM module not initialized, using mathjs fallback');
   * ```
   */
  warn(message: string, metadata?: Record<string, unknown>): void {
    if (shouldLog(LogLevel.WARN)) {
      console.warn(formatLogMessage(LogLevel.WARN, message, metadata));
    }
  },

  /**
   * Logs an informational message.
   * Outputs to stdout (console.log).
   *
   * @param {string} message - The info message
   * @param {Record<string, unknown>} [metadata] - Optional metadata
   *
   * @example
   * ```typescript
   * logger.info('MCP Server started', { version: '2.1.0' });
   * ```
   */
  info(message: string, metadata?: Record<string, unknown>): void {
    if (shouldLog(LogLevel.INFO)) {
      console.log(formatLogMessage(LogLevel.INFO, message, metadata));
    }
  },

  /**
   * Logs a debug message. Only logged when LOG_LEVEL=debug.
   * Outputs to stdout (console.log).
   *
   * @param {string} message - The debug message
   * @param {Record<string, unknown>} [metadata] - Optional metadata
   *
   * @example
   * ```typescript
   * logger.debug('Matrix operation routed to WASM', { size: '20x20' });
   * ```
   */
  debug(message: string, metadata?: Record<string, unknown>): void {
    if (shouldLog(LogLevel.DEBUG)) {
      console.log(formatLogMessage(LogLevel.DEBUG, message, metadata));
    }
  },
};

/**
 * Performance statistics tracker.
 * Tracks operation counts and timing for monitoring.
 */
class PerformanceTracker {
  private operationCounts: Map<string, number> = new Map();
  private operationTimes: Map<string, number> = new Map();

  /**
   * Records an operation execution.
   *
   * @param {string} operation - Name of the operation
   * @param {number} durationMs - Duration in milliseconds
   *
   * @example
   * ```typescript
   * const start = performance.now();
   * await doWork();
   * perfTracker.recordOperation('matrix_multiply', performance.now() - start);
   * ```
   */
  recordOperation(operation: string, durationMs: number): void {
    this.operationCounts.set(operation, (this.operationCounts.get(operation) || 0) + 1);
    this.operationTimes.set(
      operation,
      (this.operationTimes.get(operation) || 0) + durationMs
    );
  }

  /**
   * Gets statistics for a specific operation.
   *
   * @param {string} operation - Name of the operation
   * @returns {Object} Statistics object
   *
   * @example
   * ```typescript
   * const stats = perfTracker.getStats('matrix_multiply');
   * // { count: 150, totalTime: 1500, avgTime: 10 }
   * ```
   */
  getStats(operation: string): {
    count: number;
    totalTime: number;
    avgTime: number;
  } {
    const count = this.operationCounts.get(operation) || 0;
    const totalTime = this.operationTimes.get(operation) || 0;
    return {
      count,
      totalTime,
      avgTime: count > 0 ? totalTime / count : 0,
    };
  }

  /**
   * Gets statistics for all operations.
   *
   * @returns {Map<string, Object>} Map of operation names to their stats
   *
   * @example
   * ```typescript
   * const allStats = perfTracker.getAllStats();
   * for (const [op, stats] of allStats) {
   *   console.log(`${op}: ${stats.count} calls, ${stats.avgTime}ms avg`);
   * }
   * ```
   */
  getAllStats(): Map<string, { count: number; totalTime: number; avgTime: number }> {
    const stats = new Map();
    for (const operation of this.operationCounts.keys()) {
      stats.set(operation, this.getStats(operation));
    }
    return stats;
  }

  /**
   * Resets all statistics.
   *
   * @example
   * ```typescript
   * perfTracker.reset();
   * ```
   */
  reset(): void {
    this.operationCounts.clear();
    this.operationTimes.clear();
  }
}

/**
 * Global performance tracker instance.
 *
 * @constant
 * @type {PerformanceTracker}
 */
export const perfTracker = new PerformanceTracker();

/**
 * Reads version from package.json dynamically.
 * Ensures version consistency across the application.
 *
 * @returns {Promise<string>} The version string from package.json
 *
 * @example
 * ```typescript
 * const version = await getPackageVersion();
 * // Returns: "2.1.0"
 * ```
 */
export async function getPackageVersion(): Promise<string> {
  try {
    // In production (dist/), package.json is one level up
    // In development (src/), package.json is one level up
    const packageJsonPath = new URL('../package.json', import.meta.url);
    const packageJson = await import(packageJsonPath.href, {
      assert: { type: 'json' },
    });
    return packageJson.default.version || '2.0.1';
  } catch (error) {
    logger.warn('Failed to read package.json version', {
      error: error instanceof Error ? error.message : String(error),
    });
    return '2.0.1'; // Fallback version
  }
}

/**
 * Formats a number to a fixed number of decimal places.
 *
 * @param {number} value - The number to format
 * @param {number} [decimals=4] - Number of decimal places
 * @returns {string} Formatted number string
 *
 * @example
 * ```typescript
 * formatNumber(3.14159265359, 2); // "3.14"
 * formatNumber(1000, 0);          // "1000"
 * ```
 */
export function formatNumber(value: number, decimals = 4): string {
  return value.toFixed(decimals);
}

/**
 * Checks if a value is a plain object (not an array or null).
 *
 * @param {unknown} value - The value to check
 * @returns {boolean} True if value is a plain object
 *
 * @example
 * ```typescript
 * isPlainObject({ a: 1 });  // true
 * isPlainObject([1, 2, 3]); // false
 * isPlainObject(null);      // false
 * ```
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}
