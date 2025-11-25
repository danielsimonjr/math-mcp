/**
 * @file logger.ts
 * @description Centralized logging utility (Layer 1 - No dependencies)
 *
 * This module provides a simple, level-based logging system with proper
 * stream separation (stderr for errors/warnings, stdout for info/debug).
 *
 * **Dependency Layer:** 1 (No internal dependencies)
 *
 * @module shared/logger
 * @since 3.1.1
 */

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
