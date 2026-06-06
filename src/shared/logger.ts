/**
 * @file logger.ts
 * @description Centralized logging utility (Layer 1 - No dependencies)
 *
 * All log levels write to stderr. This server uses stdio transport for MCP,
 * which reserves stdout for the JSON-RPC channel — any non-JSON byte on
 * stdout corrupts the protocol stream and disconnects the client.
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
 * All levels write to stderr; stdout is reserved for MCP JSON-RPC traffic.
 *
 * @constant
 * @type {Object}
 */
export const logger = {
  error(message: string, metadata?: Record<string, unknown>): void {
    if (shouldLog(LogLevel.ERROR)) {
      console.error(formatLogMessage(LogLevel.ERROR, message, metadata));
    }
  },

  warn(message: string, metadata?: Record<string, unknown>): void {
    if (shouldLog(LogLevel.WARN)) {
      console.error(formatLogMessage(LogLevel.WARN, message, metadata));
    }
  },

  info(message: string, metadata?: Record<string, unknown>): void {
    if (shouldLog(LogLevel.INFO)) {
      console.error(formatLogMessage(LogLevel.INFO, message, metadata));
    }
  },

  debug(message: string, metadata?: Record<string, unknown>): void {
    if (shouldLog(LogLevel.DEBUG)) {
      console.error(formatLogMessage(LogLevel.DEBUG, message, metadata));
    }
  },
};
