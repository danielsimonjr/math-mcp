/**
 * @file constants.ts
 * @description Shared constants across the application (Layer 1 - No dependencies)
 *
 * This module contains application-wide constants that are used across
 * multiple modules without creating circular dependencies.
 *
 * **Dependency Layer:** 1 (No internal dependencies)
 *
 * @module shared/constants
 * @since 3.1.1
 */

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
 * Performance tracking configuration.
 * Can be disabled via DISABLE_PERF_TRACKING environment variable.
 *
 * @constant
 * @type {boolean}
 */
export const PERF_TRACKING_ENABLED = process.env.DISABLE_PERF_TRACKING !== 'true';

/**
 * Performance logging configuration.
 * Can be enabled via ENABLE_PERF_LOGGING environment variable.
 *
 * @constant
 * @type {boolean}
 */
export const PERF_LOGGING_ENABLED = process.env.ENABLE_PERF_LOGGING === 'true';
