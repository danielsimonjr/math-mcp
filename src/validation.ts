/**
 * @file validation.ts
 * @description Input validation utilities for the Math MCP Server
 *
 * This module provides comprehensive validation functions to ensure all user inputs
 * are safe, properly formatted, and within acceptable limits. Validation helps prevent:
 * - JSON injection attacks
 * - Resource exhaustion (DoS)
 * - Type errors and runtime crashes
 * - Mathematical edge cases
 *
 * @module validation
 * @since 2.1.0
 */

import { ValidationError, SizeLimitError, ComplexityError } from './errors.js';

/**
 * Configuration limits for input validation.
 * These values are chosen to balance functionality with security.
 *
 * @constant
 * @type {Object}
 */
export const LIMITS = {
  /**
   * Maximum size for square matrices (e.g., 1000x1000)
   * Prevents memory exhaustion from extremely large matrices
   * @type {number}
   */
  MAX_MATRIX_SIZE: 1000,

  /**
   * Maximum length for data arrays in statistical operations
   * @type {number}
   */
  MAX_ARRAY_LENGTH: 100000,

  /**
   * Maximum length for mathematical expressions (characters)
   * Prevents parsing overhead from extremely long expressions
   * @type {number}
   */
  MAX_EXPRESSION_LENGTH: 10000,

  /**
   * Maximum nesting depth in expressions (parentheses, brackets)
   * Prevents stack overflow from deeply nested operations
   * @type {number}
   */
  MAX_NESTING_DEPTH: 50,

  /**
   * Maximum length for variable names in expressions
   * @type {number}
   */
  MAX_VARIABLE_NAME_LENGTH: 100,

  /**
   * Maximum number of variables in scope object
   * @type {number}
   */
  MAX_SCOPE_VARIABLES: 100,
} as const;

/**
 * Safely parses a JSON string with proper error handling.
 * Wraps JSON.parse() to provide more informative error messages.
 *
 * Note: Uses synchronous JSON.parse(). This is acceptable because:
 * - JSON.parse is extremely fast in V8 (millions of ops/sec)
 * - Input size is limited by MAX_MATRIX_SIZE (1000x1000) and MAX_ARRAY_SIZE
 * - Typical payloads parse in <1ms, max payloads parse in <10ms
 * - Early size check prevents oversized inputs from blocking event loop
 *
 * @template T - The expected type of the parsed JSON
 * @param {string} jsonString - The JSON string to parse
 * @param {string} context - Description of what's being parsed (for error messages)
 * @returns {T} The parsed JSON object
 * @throws {ValidationError} If JSON parsing fails or input is too large
 *
 * @example
 * ```typescript
 * const matrix = safeJsonParse<number[][]>('[[1,2],[3,4]]', 'matrix_a');
 * // Returns: [[1,2],[3,4]]
 *
 * safeJsonParse('invalid json', 'test');
 * // Throws: ValidationError("Invalid JSON in test: Unexpected token...")
 * ```
 */
export function safeJsonParse<T = unknown>(jsonString: string, context: string): T {
  if (typeof jsonString !== 'string') {
    throw new ValidationError(`${context} must be a string, got ${typeof jsonString}`);
  }

  if (jsonString.trim().length === 0) {
    throw new ValidationError(`${context} cannot be empty`);
  }

  // Early size check: prevent parsing of oversized inputs that could block event loop
  // Max reasonable size: 1000x1000 matrix = ~1M numbers * ~10 chars each = ~10MB
  const MAX_JSON_STRING_LENGTH = 20 * 1024 * 1024; // 20MB limit

  if (jsonString.length > MAX_JSON_STRING_LENGTH) {
    throw new ValidationError(
      `${context} exceeds maximum size of ${MAX_JSON_STRING_LENGTH} characters (got ${jsonString.length})`
    );
  }

  try {
    return JSON.parse(jsonString) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ValidationError(`Invalid JSON in ${context}: ${message}`, { cause: error });
  }
}

/**
 * Validates that a value is a 2D array of numbers (a matrix).
 * Checks type, structure, and content validity.
 *
 * @param {unknown} data - The data to validate
 * @param {string} context - Description of the matrix (for error messages)
 * @returns {number[][]} The validated matrix
 * @throws {ValidationError} If validation fails
 *
 * @example
 * ```typescript
 * validateMatrix([[1,2],[3,4]], 'matrix_a');
 * // Returns: [[1,2],[3,4]]
 *
 * validateMatrix([1,2,3], 'matrix_a');
 * // Throws: ValidationError("matrix_a must be a 2D array...")
 *
 * validateMatrix([[1,2],[3,'x']], 'matrix_a');
 * // Throws: ValidationError("matrix_a contains non-numeric value...")
 * ```
 */
export function validateMatrix(data: unknown, context: string): number[][] {
  // Check if it's an array
  if (!Array.isArray(data)) {
    throw new ValidationError(`${context} must be an array, got ${typeof data}`);
  }

  // Check if it's not empty
  if (data.length === 0) {
    throw new ValidationError(`${context} cannot be empty`);
  }

  // Check if all rows are arrays
  if (!data.every((row) => Array.isArray(row))) {
    throw new ValidationError(`${context} must be a 2D array (array of arrays)`);
  }

  const matrix = data as unknown[][];

  // Check if all rows have the same length
  const firstRowLength = matrix[0].length;
  if (firstRowLength === 0) {
    throw new ValidationError(`${context} rows cannot be empty`);
  }

  for (let i = 1; i < matrix.length; i++) {
    if (matrix[i].length !== firstRowLength) {
      throw new ValidationError(
        `${context} rows must have equal length. Row 0 has ${firstRowLength} elements, row ${i} has ${matrix[i].length}`
      );
    }
  }

  // Check if all elements are numbers
  for (let i = 0; i < matrix.length; i++) {
    for (let j = 0; j < matrix[i].length; j++) {
      const value = matrix[i][j];
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new ValidationError(
          `${context} contains non-numeric or non-finite value at position [${i}][${j}]: ${value}`
        );
      }
    }
  }

  return matrix as number[][];
}

/**
 * Validates that a matrix is square (rows === columns).
 *
 * @param {number[][]} matrix - The matrix to validate
 * @param {string} context - Description of the matrix (for error messages)
 * @returns {number[][]} The validated square matrix
 * @throws {ValidationError} If matrix is not square
 *
 * @example
 * ```typescript
 * validateSquareMatrix([[1,2],[3,4]], 'matrix_a');
 * // Returns: [[1,2],[3,4]]
 *
 * validateSquareMatrix([[1,2,3],[4,5,6]], 'matrix_a');
 * // Throws: ValidationError("matrix_a must be square...")
 * ```
 */
export function validateSquareMatrix(matrix: number[][], context: string): number[][] {
  if (matrix.length !== matrix[0].length) {
    throw new ValidationError(
      `${context} must be square (n×n). Got ${matrix.length}×${matrix[0].length}`
    );
  }
  return matrix;
}

/**
 * Validates that a matrix size is within acceptable limits.
 * Prevents resource exhaustion from extremely large matrices.
 *
 * @param {number[][]} matrix - The matrix to validate
 * @param {string} context - Description of the matrix (for error messages)
 * @returns {number[][]} The validated matrix
 * @throws {SizeLimitError} If matrix exceeds size limits
 *
 * @example
 * ```typescript
 * validateMatrixSize([[1,2],[3,4]], 'matrix_a');
 * // Returns: [[1,2],[3,4]]
 *
 * const huge = new Array(2000).fill(0).map(() => new Array(2000).fill(0));
 * validateMatrixSize(huge, 'matrix_a');
 * // Throws: SizeLimitError("matrix_a size 2000×2000 exceeds maximum...")
 * ```
 */
export function validateMatrixSize(matrix: number[][], context: string): number[][] {
  const rows = matrix.length;
  const cols = matrix[0].length;

  if (rows > LIMITS.MAX_MATRIX_SIZE || cols > LIMITS.MAX_MATRIX_SIZE) {
    throw new SizeLimitError(
      `${context} size ${rows}×${cols} exceeds maximum allowed size of ${LIMITS.MAX_MATRIX_SIZE}×${LIMITS.MAX_MATRIX_SIZE}`
    );
  }

  return matrix;
}

/**
 * Validates that two matrices are compatible for the given operation.
 *
 * @param {number[][]} matrixA - First matrix
 * @param {number[][]} matrixB - Second matrix
 * @param {string} operation - The operation being performed ('multiply', 'add', etc.)
 * @throws {ValidationError} If matrices are incompatible
 *
 * @example
 * ```typescript
 * validateMatrixCompatibility([[1,2,3]], [[1],[2],[3]], 'multiply');
 * // OK: 1×3 × 3×1 is valid
 *
 * validateMatrixCompatibility([[1,2]], [[1,2,3]], 'multiply');
 * // Throws: ValidationError("Cannot multiply...")
 *
 * validateMatrixCompatibility([[1,2]], [[1,2,3]], 'add');
 * // Throws: ValidationError("Cannot add...")
 * ```
 */
export function validateMatrixCompatibility(
  matrixA: number[][],
  matrixB: number[][],
  operation: string
): void {
  const aRows = matrixA.length;
  const aCols = matrixA[0].length;
  const bRows = matrixB.length;
  const bCols = matrixB[0].length;

  switch (operation) {
    case 'multiply':
      if (aCols !== bRows) {
        throw new ValidationError(
          `Cannot multiply matrices: first matrix columns (${aCols}) must equal second matrix rows (${bRows})`
        );
      }
      break;

    case 'add':
    case 'subtract':
      if (aRows !== bRows || aCols !== bCols) {
        throw new ValidationError(
          `Cannot ${operation} matrices: dimensions must match. Got ${aRows}×${aCols} and ${bRows}×${bCols}`
        );
      }
      break;

    default:
      throw new ValidationError(`Unknown matrix operation: ${operation}`);
  }
}

/**
 * Validates that a value is an array of numbers.
 *
 * @param {unknown} data - The data to validate
 * @param {string} context - Description of the array (for error messages)
 * @returns {number[]} The validated array
 * @throws {ValidationError} If validation fails
 *
 * @example
 * ```typescript
 * validateNumberArray([1,2,3,4,5], 'data');
 * // Returns: [1,2,3,4,5]
 *
 * validateNumberArray([1,2,'x',4], 'data');
 * // Throws: ValidationError("data contains non-numeric value...")
 * ```
 */
export function validateNumberArray(data: unknown, context: string): number[] {
  if (!Array.isArray(data)) {
    throw new ValidationError(`${context} must be an array, got ${typeof data}`);
  }

  if (data.length === 0) {
    throw new ValidationError(`${context} cannot be empty`);
  }

  for (let i = 0; i < data.length; i++) {
    const value = data[i];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new ValidationError(
        `${context} contains non-numeric or non-finite value at index ${i}: ${value}`
      );
    }
  }

  return data as number[];
}

/**
 * Validates that an array length is within acceptable limits.
 *
 * @param {number[]} array - The array to validate
 * @param {string} context - Description of the array (for error messages)
 * @returns {number[]} The validated array
 * @throws {SizeLimitError} If array exceeds length limit
 *
 * @example
 * ```typescript
 * validateArrayLength([1,2,3,4,5], 'data');
 * // Returns: [1,2,3,4,5]
 *
 * const huge = new Array(200000).fill(1);
 * validateArrayLength(huge, 'data');
 * // Throws: SizeLimitError("data length 200000 exceeds maximum...")
 * ```
 */
export function validateArrayLength(array: number[], context: string): number[] {
  if (array.length > LIMITS.MAX_ARRAY_LENGTH) {
    throw new SizeLimitError(
      `${context} length ${array.length} exceeds maximum allowed length of ${LIMITS.MAX_ARRAY_LENGTH}`
    );
  }
  return array;
}

/**
 * Validates a mathematical expression string.
 * Checks length and basic structure to prevent malicious inputs.
 *
 * @param {string} expression - The expression to validate
 * @param {string} context - Description of the expression (for error messages)
 * @returns {string} The validated expression
 * @throws {ValidationError} If validation fails
 * @throws {ComplexityError} If expression is too complex
 *
 * @example
 * ```typescript
 * validateExpression("2 + 2", "expression");
 * // Returns: "2 + 2"
 *
 * validateExpression("", "expression");
 * // Throws: ValidationError("expression cannot be empty")
 *
 * validateExpression("(".repeat(100), "expression");
 * // Throws: ComplexityError("expression has too many nested parentheses...")
 * ```
 */
export function validateExpression(expression: string, context: string): string {
  if (typeof expression !== 'string') {
    throw new ValidationError(`${context} must be a string, got ${typeof expression}`);
  }

  const trimmed = expression.trim();

  if (trimmed.length === 0) {
    throw new ValidationError(`${context} cannot be empty`);
  }

  if (trimmed.length > LIMITS.MAX_EXPRESSION_LENGTH) {
    throw new ComplexityError(
      `${context} length ${trimmed.length} exceeds maximum allowed length of ${LIMITS.MAX_EXPRESSION_LENGTH}`
    );
  }

  // Check nesting depth (count parentheses and brackets)
  let depth = 0;
  let maxDepth = 0;

  for (const char of trimmed) {
    if (char === '(' || char === '[' || char === '{') {
      depth++;
      maxDepth = Math.max(maxDepth, depth);
    } else if (char === ')' || char === ']' || char === '}') {
      depth--;
    }
  }

  if (maxDepth > LIMITS.MAX_NESTING_DEPTH) {
    throw new ComplexityError(
      `${context} has nesting depth of ${maxDepth}, maximum allowed is ${LIMITS.MAX_NESTING_DEPTH}`
    );
  }

  if (depth !== 0) {
    throw new ValidationError(`${context} has unbalanced parentheses/brackets`);
  }

  return trimmed;
}

/**
 * Validates a variable name for use in expressions.
 *
 * @param {string} variableName - The variable name to validate
 * @param {string} context - Description (for error messages)
 * @returns {string} The validated variable name
 * @throws {ValidationError} If validation fails
 *
 * @example
 * ```typescript
 * validateVariableName("x", "variable");
 * // Returns: "x"
 *
 * validateVariableName("my_var123", "variable");
 * // Returns: "my_var123"
 *
 * validateVariableName("123invalid", "variable");
 * // Throws: ValidationError("variable must start with a letter or underscore")
 * ```
 */
export function validateVariableName(variableName: string, context: string): string {
  if (typeof variableName !== 'string') {
    throw new ValidationError(`${context} must be a string, got ${typeof variableName}`);
  }

  const trimmed = variableName.trim();

  if (trimmed.length === 0) {
    throw new ValidationError(`${context} cannot be empty`);
  }

  if (trimmed.length > LIMITS.MAX_VARIABLE_NAME_LENGTH) {
    throw new ValidationError(
      `${context} length ${trimmed.length} exceeds maximum allowed length of ${LIMITS.MAX_VARIABLE_NAME_LENGTH}`
    );
  }

  // Must start with letter or underscore
  if (!/^[a-zA-Z_]/.test(trimmed)) {
    throw new ValidationError(`${context} must start with a letter or underscore`);
  }

  // Must contain only alphanumeric characters and underscores
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmed)) {
    throw new ValidationError(
      `${context} can only contain letters, numbers, and underscores`
    );
  }

  return trimmed;
}

/**
 * Validates a scope object containing variables for expression evaluation.
 *
 * @param {unknown} scope - The scope object to validate
 * @param {string} context - Description (for error messages)
 * @returns {Record<string, number>} The validated scope object
 * @throws {ValidationError} If validation fails
 *
 * @example
 * ```typescript
 * validateScope({ x: 5, y: 10 }, "scope");
 * // Returns: { x: 5, y: 10 }
 *
 * validateScope({ x: "invalid" }, "scope");
 * // Throws: ValidationError("scope variable 'x' must be a number...")
 * ```
 */
export function validateScope(
  scope: unknown,
  context: string
): Record<string, number> {
  if (typeof scope !== 'object' || scope === null || Array.isArray(scope)) {
    throw new ValidationError(`${context} must be an object`);
  }

  const scopeObj = scope as Record<string, unknown>;
  const keys = Object.keys(scopeObj);

  if (keys.length > LIMITS.MAX_SCOPE_VARIABLES) {
    throw new SizeLimitError(
      `${context} has ${keys.length} variables, maximum allowed is ${LIMITS.MAX_SCOPE_VARIABLES}`
    );
  }

  const validatedScope: Record<string, number> = {};

  for (const key of keys) {
    validateVariableName(key, `${context} variable name`);

    const value = scopeObj[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new ValidationError(
        `${context} variable '${key}' must be a finite number, got ${typeof value}`
      );
    }

    validatedScope[key] = value;
  }

  return validatedScope;
}

/**
 * Validates an enum value against allowed options.
 *
 * @template T - The type of the enum values
 * @param {unknown} value - The value to validate
 * @param {readonly T[]} allowedValues - Array of allowed values
 * @param {string} context - Description (for error messages)
 * @returns {T} The validated value
 * @throws {ValidationError} If value is not in allowed values
 *
 * @example
 * ```typescript
 * validateEnum("mean", ["mean", "median", "mode"] as const, "operation");
 * // Returns: "mean"
 *
 * validateEnum("invalid", ["mean", "median", "mode"] as const, "operation");
 * // Throws: ValidationError("operation must be one of: mean, median, mode...")
 * ```
 */
export function validateEnum<T extends string>(
  value: unknown,
  allowedValues: readonly T[],
  context: string
): T {
  if (typeof value !== 'string') {
    throw new ValidationError(`${context} must be a string, got ${typeof value}`);
  }

  if (!allowedValues.includes(value as T)) {
    throw new ValidationError(
      `${context} must be one of: ${allowedValues.join(', ')}. Got: ${value}`
    );
  }

  return value as T;
}
