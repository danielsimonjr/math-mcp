/**
 * @file errors.ts
 * @description Custom error types for the Math MCP Server
 *
 * This module defines specialized error classes to categorize different types
 * of errors that can occur during mathematical operations. Using specific error
 * types allows for better error handling and more informative error messages.
 *
 * @module errors
 * @since 2.1.0
 */

/**
 * Base error class for all Math MCP errors.
 * Extends the native Error class with additional context.
 *
 * @class MathMCPError
 * @extends Error
 *
 * @example
 * ```typescript
 * throw new MathMCPError("General math operation failed");
 * ```
 */
export class MathMCPError extends Error {
  /**
   * The name of the error type
   * @type {string}
   */
  override name = "MathMCPError";

  /**
   * Creates a new MathMCPError instance
   *
   * @param {string} message - Human-readable description of the error
   * @param {ErrorOptions} [options] - Optional error options (cause, etc.)
   */
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    Object.setPrototypeOf(this, MathMCPError.prototype);
  }
}

/**
 * Error thrown when input validation fails.
 * Used for malformed JSON, invalid matrix dimensions, out-of-range values, etc.
 *
 * @class ValidationError
 * @extends MathMCPError
 *
 * @example
 * ```typescript
 * throw new ValidationError("Matrix must be square", { cause: originalError });
 * ```
 */
export class ValidationError extends MathMCPError {
  /**
   * The name of the error type
   * @type {string}
   */
  override name = "ValidationError";

  /**
   * Creates a new ValidationError instance
   *
   * @param {string} message - Description of the validation failure
   * @param {ErrorOptions} [options] - Optional error options
   */
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/**
 * Error thrown when a WASM operation fails.
 * Indicates issues with WASM initialization, execution, or memory management.
 *
 * @class WasmError
 * @extends MathMCPError
 *
 * @example
 * ```typescript
 * throw new WasmError("Failed to initialize WASM module", { cause: err });
 * ```
 */
export class WasmError extends MathMCPError {
  /**
   * The name of the error type
   * @type {string}
   */
  override name = "WasmError";

  /**
   * Creates a new WasmError instance
   *
   * @param {string} message - Description of the WASM error
   * @param {ErrorOptions} [options] - Optional error options
   */
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    Object.setPrototypeOf(this, WasmError.prototype);
  }
}

/**
 * Error thrown when an operation exceeds its timeout limit.
 * Used to prevent long-running operations from blocking the server.
 *
 * @class TimeoutError
 * @extends MathMCPError
 *
 * @example
 * ```typescript
 * throw new TimeoutError("Matrix operation exceeded 30s timeout");
 * ```
 */
export class TimeoutError extends MathMCPError {
  /**
   * The name of the error type
   * @type {string}
   */
  override name = "TimeoutError";

  /**
   * Creates a new TimeoutError instance
   *
   * @param {string} message - Description of the timeout
   * @param {ErrorOptions} [options] - Optional error options
   */
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    Object.setPrototypeOf(this, TimeoutError.prototype);
  }
}

/**
 * Error thrown when input size exceeds configured limits.
 * Prevents resource exhaustion attacks by rejecting overly large inputs.
 *
 * @class SizeLimitError
 * @extends ValidationError
 *
 * @example
 * ```typescript
 * throw new SizeLimitError("Matrix size 2000x2000 exceeds limit of 1000x1000");
 * ```
 */
export class SizeLimitError extends ValidationError {
  /**
   * The name of the error type
   * @type {string}
   */
  override name = "SizeLimitError";

  /**
   * Creates a new SizeLimitError instance
   *
   * @param {string} message - Description of the size limit violation
   * @param {ErrorOptions} [options] - Optional error options
   */
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    Object.setPrototypeOf(this, SizeLimitError.prototype);
  }
}

/**
 * Error thrown when expression complexity exceeds safe limits.
 * Prevents potential DoS attacks through deeply nested or overly complex expressions.
 *
 * @class ComplexityError
 * @extends ValidationError
 *
 * @example
 * ```typescript
 * throw new ComplexityError("Expression has 100 nested parentheses, max is 50");
 * ```
 */
export class ComplexityError extends ValidationError {
  /**
   * The name of the error type
   * @type {string}
   */
  override name = "ComplexityError";

  /**
   * Creates a new ComplexityError instance
   *
   * @param {string} message - Description of the complexity violation
   * @param {ErrorOptions} [options] - Optional error options
   */
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    Object.setPrototypeOf(this, ComplexityError.prototype);
  }
}

/**
 * Error thrown when rate limiting is exceeded.
 * Prevents DoS attacks by rejecting excessive requests.
 *
 * @class RateLimitError
 * @extends MathMCPError
 *
 * @example
 * ```typescript
 * throw new RateLimitError("Rate limit exceeded: 100 requests per minute");
 * ```
 */
export class RateLimitError extends MathMCPError {
  /**
   * The name of the error type
   * @type {string}
   */
  override name = "RateLimitError";

  /**
   * Rate limiter statistics at time of error
   * @type {Record<string, unknown> | undefined}
   */
  public readonly stats?: Record<string, unknown>;

  /**
   * Creates a new RateLimitError instance
   *
   * @param {string} message - Description of the rate limit violation
   * @param {Record<string, unknown>} [stats] - Optional rate limiter statistics
   * @param {ErrorOptions} [options] - Optional error options
   */
  constructor(message: string, stats?: Record<string, unknown>, options?: ErrorOptions) {
    super(message, options);
    this.stats = stats;
    Object.setPrototypeOf(this, RateLimitError.prototype);
  }
}
