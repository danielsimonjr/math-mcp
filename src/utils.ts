/**
 * @file utils.ts
 * @description Utility functions for the Math MCP Server (Layer 2)
 *
 * This module provides common utility functions including:
 * - Timeout protection for async operations
 * - Performance monitoring utilities
 * - Package version management
 * - Helper functions
 *
 * **Dependency Layer:** 2 (Depends on Layer 1: shared/logger, shared/constants, errors)
 *
 * @module utils
 * @since 2.1.0
 */

import { TimeoutError } from './errors.js';
import { logger } from './shared/logger.js';
import { DEFAULT_OPERATION_TIMEOUT as DEFAULT_TIMEOUT } from './shared/constants.js';

/**
 * Re-export logger for backwards compatibility.
 * @deprecated Import directly from './shared/logger.js' instead
 */
export { logger } from './shared/logger.js';

/**
 * Re-export LogLevel for backwards compatibility.
 * @deprecated Import directly from './shared/logger.js' instead
 */
export { LogLevel } from './shared/logger.js';

/**
 * Default timeout for mathematical operations (30 seconds).
 * Re-exported from shared/constants for backwards compatibility.
 * @deprecated Import directly from './shared/constants.js' instead
 */
export const DEFAULT_OPERATION_TIMEOUT = DEFAULT_TIMEOUT;

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
