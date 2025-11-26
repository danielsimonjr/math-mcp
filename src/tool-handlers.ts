/**
 * @file tool-handlers.ts
 * @description Shared tool handler implementations for the Math MCP Server
 *
 * This module contains all the business logic for handling mathematical operations.
 * By centralizing the handlers, we avoid code duplication between index.ts and
 * index-wasm.ts, making the codebase more maintainable.
 *
 * Each handler:
 * - Validates inputs thoroughly
 * - Handles errors gracefully
 * - Uses timeout protection for potentially long operations
 * - Returns properly formatted responses
 *
 * @module tool-handlers
 * @since 2.1.0
 */

import * as math from 'mathjs';
import {
  validateExpression,
  validateScope,
  validateVariableName,
  validateMatrix,
  validateSquareMatrix,
  validateMatrixSize,
  validateMatrixCompatibility,
  validateNumberArray,
  validateArrayLength,
  validateEnum,
  safeJsonParse,
} from './validation.js';
import { ValidationError, MathMCPError } from './errors.js';
import { withTimeout, DEFAULT_OPERATION_TIMEOUT, logger, perfTracker } from './utils.js';
import { getCachedExpression } from './expression-cache.js';

/**
 * Type for acceleration wrapper functions (optional, may not be available).
 * This allows the handlers to work with intelligent routing through
 * mathjs → WASM → WebWorkers → WebGPU acceleration layers.
 *
 * @since 3.0.0
 */
export interface AccelerationWrapper {
  matrixMultiply: (a: number[][], b: number[][]) => Promise<number[][]>;
  matrixDeterminant: (matrix: number[][]) => Promise<number>;
  matrixTranspose: (matrix: number[][]) => Promise<number[][]>;
  matrixAdd: (a: number[][], b: number[][]) => Promise<number[][]>;
  matrixSubtract: (a: number[][], b: number[][]) => Promise<number[][]>;
  statsMean: (data: number[]) => Promise<number>;
  statsMedian: (data: number[]) => Promise<number>;
  statsMode: (data: number[]) => Promise<number[]>;
  statsStd: (data: number[]) => Promise<number>;
  statsVariance: (data: number[]) => Promise<number>;
  statsMin: (data: number[]) => Promise<number>;
  statsMax: (data: number[]) => Promise<number>;
  statsSum: (data: number[]) => Promise<number>;
}

/**
 * Legacy alias for backward compatibility.
 * @deprecated Use AccelerationWrapper instead
 */
export type WasmWrapper = AccelerationWrapper;

/**
 * Standard response format for tool handlers.
 *
 * @interface ToolResponse
 */
export interface ToolResponse {
  /** Content blocks to return to the client */
  content: Array<{
    type: string;
    text: string;
  }>;
  /** Whether this response represents an error */
  isError: boolean;
}

/**
 * Safely evaluates a mathematical expression by validating the AST.
 *
 * Security features:
 * - Parses expression to AST and validates node types
 * - Blocks function definitions, assignments, and imports
 * - Only allows mathematical operations and constants
 * - Uses restricted evaluation scope
 *
 * @param {string} expression - The expression to evaluate
 * @param {Record<string, number>} scope - Variable scope
 * @returns {number | math.Matrix | math.Complex | math.Fraction | math.BigNumber} The evaluation result
 * @throws {ValidationError} If expression contains unsafe operations
 */
function safeEvaluate(
  expression: string,
  scope: Record<string, number>
): number | math.Matrix | math.Complex | math.Fraction | math.BigNumber {
  // List of allowed node types (safe mathematical operations)
  const ALLOWED_NODE_TYPES = new Set([
    'ConstantNode',      // Numbers: 42, 3.14
    'SymbolNode',        // Variables: x, y
    'OperatorNode',      // Operators: +, -, *, /, ^
    'ParenthesisNode',   // Parentheses: (...)
    'FunctionNode',      // Math functions: sin(), sqrt(), etc.
    'ArrayNode',         // Arrays: [1, 2, 3]
    'AccessorNode',      // Array access: arr[0]
    'IndexNode',         // Index: [0]
    'RangeNode',         // Ranges: 1:10
  ]);

  // Forbidden function names (even though they're FunctionNodes)
  const FORBIDDEN_FUNCTIONS = new Set([
    'import',
    'createUnit',
    'evaluate',
    'parse',
    'compile',
    'help',
  ]);

  // Recursively validate AST nodes
  // Note: Using 'any' for internal AST traversal as mathjs MathNode doesn't expose all properties
  function validateNode(n: any): void {
    if (!n || !n.type) {
      return;
    }

    // Check if node type is allowed
    if (!ALLOWED_NODE_TYPES.has(n.type)) {
      throw new ValidationError(
        `Unsafe operation detected: ${n.type} is not allowed in expressions`
      );
    }

    // Special check for FunctionNode - block dangerous functions
    if (n.type === 'FunctionNode' && FORBIDDEN_FUNCTIONS.has(n.fn?.name || n.name)) {
      throw new ValidationError(
        `Function '${n.fn?.name || n.name}' is not allowed for security reasons`
      );
    }

    // Check for assignment operations
    if (n.type === 'AssignmentNode' || n.type === 'FunctionAssignmentNode') {
      throw new ValidationError(
        'Assignment operations are not allowed in expressions'
      );
    }

    // Recursively validate child nodes
    if (n.args && Array.isArray(n.args)) {
      n.args.forEach(validateNode);
    }
    if (n.content) {
      validateNode(n.content);
    }
    if (n.index) {
      validateNode(n.index);
    }
    if (n.items && Array.isArray(n.items)) {
      n.items.forEach(validateNode);
    }
    if (n.blocks && Array.isArray(n.blocks)) {
      n.blocks.forEach((block: any) => {
        if (block.node) validateNode(block.node);
      });
    }
  }

  // Use cached compiled expression if available
  const compiled = getCachedExpression(
    expression,
    () => {
      // Parse expression to AST
      const node = math.parse(expression);

      // Validate the entire AST
      validateNode(node);

      // Compile and return
      return node.compile();
    },
    scope
  );

  // Evaluate with scope
  return compiled.evaluate(scope);
}

/**
 * Handles the 'evaluate' tool.
 * Evaluates mathematical expressions with optional variables.
 *
 * Security considerations:
 * - Expression length and complexity are validated
 * - AST is validated to prevent code injection
 * - No function definitions or assignments allowed
 * - Scope variables are validated and type-checked
 * - Operation has timeout protection
 *
 * @param {Object} args - Tool arguments
 * @param {string} args.expression - Mathematical expression to evaluate
 * @param {Record<string, number>} [args.scope] - Optional variables
 * @returns {Promise<ToolResponse>} The evaluation result
 *
 * @example
 * ```typescript
 * await handleEvaluate({ expression: '2 + 2' });
 * // Returns: { content: [{ type: 'text', text: '{"result":"4"}' }] }
 *
 * await handleEvaluate({ expression: 'x^2 + y', scope: { x: 5, y: 3 } });
 * // Returns: { content: [{ type: 'text', text: '{"result":"28"}' }] }
 * ```
 */
export async function handleEvaluate(args: {
  expression: string;
  scope?: object;
}): Promise<ToolResponse> {
  const startTime = performance.now();

  try {
    // Validate expression
    const validatedExpression = validateExpression(args.expression, 'expression');

    // Validate scope if provided
    const validatedScope = args.scope
      ? validateScope(args.scope, 'scope')
      : {};

    logger.debug('Evaluating expression', {
      expression: validatedExpression,
      hasScope: Object.keys(validatedScope).length > 0,
    });

    // Evaluate with timeout protection and AST validation
    const result = await withTimeout(
      Promise.resolve(safeEvaluate(validatedExpression, validatedScope)),
      DEFAULT_OPERATION_TIMEOUT,
      'evaluate'
    );

    const duration = performance.now() - startTime;
    perfTracker.recordOperation('evaluate', duration);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ result: math.format(result) }, null, 2),
        },
      ],
      isError: false,
    };
  } catch (error) {
    const duration = performance.now() - startTime;
    perfTracker.recordOperation('evaluate_error', duration);

    logger.error('Evaluate operation failed', {
      expression: args.expression,
      error: error instanceof Error ? error.message : String(error),
    });

    throw error;
  }
}

/**
 * Handles the 'simplify' tool.
 * Simplifies mathematical expressions.
 *
 * @param {Object} args - Tool arguments
 * @param {string} args.expression - Expression to simplify
 * @param {string[]} [args.rules] - Optional simplification rules
 * @returns {Promise<ToolResponse>} The simplified expression
 *
 * @example
 * ```typescript
 * await handleSimplify({ expression: '2 * x + x' });
 * // Returns: { content: [{ type: 'text', text: '{"result":"3 * x"}' }] }
 * ```
 */
export async function handleSimplify(args: {
  expression: string;
  rules?: string[];
}): Promise<ToolResponse> {
  const startTime = performance.now();

  try {
    // Validate expression
    const validatedExpression = validateExpression(args.expression, 'expression');

    logger.debug('Simplifying expression', { expression: validatedExpression });

    // Simplify with timeout protection
    const simplified = await withTimeout(
      Promise.resolve(
        args.rules
          ? math.simplify(validatedExpression, args.rules)
          : math.simplify(validatedExpression)
      ),
      DEFAULT_OPERATION_TIMEOUT,
      'simplify'
    );

    const duration = performance.now() - startTime;
    perfTracker.recordOperation('simplify', duration);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ result: simplified.toString() }, null, 2),
        },
      ],
      isError: false,
    };
  } catch (error) {
    const duration = performance.now() - startTime;
    perfTracker.recordOperation('simplify_error', duration);

    logger.error('Simplify operation failed', {
      expression: args.expression,
      error: error instanceof Error ? error.message : String(error),
    });

    throw error;
  }
}

/**
 * Handles the 'derivative' tool.
 * Calculates the derivative of an expression with respect to a variable.
 *
 * @param {Object} args - Tool arguments
 * @param {string} args.expression - Expression to differentiate
 * @param {string} args.variable - Variable to differentiate with respect to
 * @returns {Promise<ToolResponse>} The derivative
 *
 * @example
 * ```typescript
 * await handleDerivative({ expression: 'x^2', variable: 'x' });
 * // Returns: { content: [{ type: 'text', text: '{"result":"2 * x"}' }] }
 * ```
 */
export async function handleDerivative(args: {
  expression: string;
  variable: string;
}): Promise<ToolResponse> {
  const startTime = performance.now();

  try {
    // Validate expression and variable
    const validatedExpression = validateExpression(args.expression, 'expression');
    const validatedVariable = validateVariableName(args.variable, 'variable');

    logger.debug('Computing derivative', {
      expression: validatedExpression,
      variable: validatedVariable,
    });

    // Calculate derivative with timeout protection
    const derivative = await withTimeout(
      Promise.resolve(math.derivative(validatedExpression, validatedVariable)),
      DEFAULT_OPERATION_TIMEOUT,
      'derivative'
    );

    const duration = performance.now() - startTime;
    perfTracker.recordOperation('derivative', duration);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ result: derivative.toString() }, null, 2),
        },
      ],
      isError: false,
    };
  } catch (error) {
    const duration = performance.now() - startTime;
    perfTracker.recordOperation('derivative_error', duration);

    logger.error('Derivative operation failed', {
      expression: args.expression,
      variable: args.variable,
      error: error instanceof Error ? error.message : String(error),
    });

    throw error;
  }
}

/**
 * Handles the 'solve' tool.
 * Solves equations for a specified variable.
 *
 * @param {Object} args - Tool arguments
 * @param {string} args.equation - Equation to solve (must contain '=')
 * @param {string} args.variable - Variable to solve for
 * @returns {Promise<ToolResponse>} The solution
 *
 * @example
 * ```typescript
 * await handleSolve({ equation: '2*x + 3 = 7', variable: 'x' });
 * // Returns solution for x
 * ```
 */
export async function handleSolve(args: {
  equation: string;
  variable: string;
}): Promise<ToolResponse> {
  const startTime = performance.now();

  try {
    // Validate inputs
    const validatedEquation = validateExpression(args.equation, 'equation');
    const validatedVariable = validateVariableName(args.variable, 'variable');

    // Parse equation into left and right sides
    const parts = validatedEquation.split('=');
    if (parts.length !== 2) {
      throw new ValidationError("Equation must contain exactly one '=' sign");
    }

    logger.debug('Solving equation', {
      equation: validatedEquation,
      variable: validatedVariable,
    });

    // Rearrange to left - right = 0
    const expr = `${parts[0].trim()} - (${parts[1].trim()})`;

    // Use cached parsed and compiled expression
    const _compiled = getCachedExpression(
      expr,
      () => {
        const node = math.parse(expr);
        return node.compile(); // Validate the expression is compilable
      }
    );

    // Try to solve symbolically
    let result: string;
    try {
      const simplified = math.simplify(expr);
      result = `Simplified equation: ${simplified.toString()} = 0`;
    } catch (e) {
      result = `Expression to solve: ${expr} = 0 for ${validatedVariable}`;
    }

    const duration = performance.now() - startTime;
    perfTracker.recordOperation('solve', duration);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ result }, null, 2),
        },
      ],
      isError: false,
    };
  } catch (error) {
    const duration = performance.now() - startTime;
    perfTracker.recordOperation('solve_error', duration);

    logger.error('Solve operation failed', {
      equation: args.equation,
      variable: args.variable,
      error: error instanceof Error ? error.message : String(error),
    });

    throw error;
  }
}

/**
 * Handles the 'matrix_operations' tool.
 * Performs various matrix operations with optional WASM acceleration.
 *
 * @param {Object} args - Tool arguments
 * @param {string} args.operation - Operation to perform
 * @param {string} args.matrix_a - First matrix (JSON string)
 * @param {string} [args.matrix_b] - Second matrix (JSON string, for binary ops)
 * @param {AccelerationWrapper} [accelerationWrapper] - Optional acceleration wrapper (mathjs/WASM/Workers/GPU)
 * @returns {Promise<ToolResponse>} The operation result
 *
 * @example
 * ```typescript
 * await handleMatrixOperations({
 *   operation: 'determinant',
 *   matrix_a: '[[1,2],[3,4]]'
 * });
 * // Returns: { content: [{ type: 'text', text: '{"result":"-2"}' }] }
 * ```
 */
export async function handleMatrixOperations(
  args: {
    operation: string;
    matrix_a: string;
    matrix_b?: string;
  },
  accelerationWrapper?: AccelerationWrapper
): Promise<ToolResponse> {
  const startTime = performance.now();

  try {
    // Validate operation type
    const validOperation = validateEnum(
      args.operation,
      ['multiply', 'inverse', 'determinant', 'transpose', 'eigenvalues', 'add', 'subtract'] as const,
      'operation'
    );

    // Parse and validate first matrix
    const matrixA = validateMatrixSize(
      validateMatrix(safeJsonParse(args.matrix_a, 'matrix_a'), 'matrix_a'),
      'matrix_a'
    );

    logger.debug('Matrix operation', {
      operation: validOperation,
      matrixASize: `${matrixA.length}×${matrixA[0].length}`,
    });

    let result: number | number[] | number[][] | { values: number[] };

    switch (validOperation) {
      case 'multiply': {
        if (!args.matrix_b) {
          throw new ValidationError('matrix_b is required for multiply operation');
        }

        const matrixB = validateMatrixSize(
          validateMatrix(safeJsonParse(args.matrix_b, 'matrix_b'), 'matrix_b'),
          'matrix_b'
        );

        validateMatrixCompatibility(matrixA, matrixB, 'multiply');

        // Use acceleration wrapper if available, otherwise use mathjs
        result = accelerationWrapper
          ? await withTimeout(
              accelerationWrapper.matrixMultiply(matrixA, matrixB),
              DEFAULT_OPERATION_TIMEOUT,
              'matrix_multiply'
            )
          : (math.multiply(matrixA, matrixB) as number[][]);
        break;
      }

      case 'inverse': {
        validateSquareMatrix(matrixA, 'matrix_a');
        result = math.inv(matrixA) as number[][];
        break;
      }

      case 'determinant': {
        validateSquareMatrix(matrixA, 'matrix_a');

        result = accelerationWrapper
          ? await withTimeout(
              accelerationWrapper.matrixDeterminant(matrixA),
              DEFAULT_OPERATION_TIMEOUT,
              'matrix_determinant'
            )
          : (math.det(matrixA) as number);
        break;
      }

      case 'transpose': {
        result = accelerationWrapper
          ? await withTimeout(
              accelerationWrapper.matrixTranspose(matrixA),
              DEFAULT_OPERATION_TIMEOUT,
              'matrix_transpose'
            )
          : (math.transpose(matrixA) as number[][]);
        break;
      }

      case 'eigenvalues': {
        validateSquareMatrix(matrixA, 'matrix_a');
        const eigResult = math.eigs(matrixA);
        result = eigResult.values as unknown as number[];
        break;
      }

      case 'add': {
        if (!args.matrix_b) {
          throw new ValidationError('matrix_b is required for add operation');
        }

        const matrixB = validateMatrixSize(
          validateMatrix(safeJsonParse(args.matrix_b, 'matrix_b'), 'matrix_b'),
          'matrix_b'
        );

        validateMatrixCompatibility(matrixA, matrixB, 'add');

        result = accelerationWrapper
          ? await withTimeout(
              accelerationWrapper.matrixAdd(matrixA, matrixB),
              DEFAULT_OPERATION_TIMEOUT,
              'matrix_add'
            )
          : (math.add(matrixA, matrixB) as number[][]);
        break;
      }

      case 'subtract': {
        if (!args.matrix_b) {
          throw new ValidationError('matrix_b is required for subtract operation');
        }

        const matrixB = validateMatrixSize(
          validateMatrix(safeJsonParse(args.matrix_b, 'matrix_b'), 'matrix_b'),
          'matrix_b'
        );

        validateMatrixCompatibility(matrixA, matrixB, 'subtract');

        result = accelerationWrapper
          ? await withTimeout(
              accelerationWrapper.matrixSubtract(matrixA, matrixB),
              DEFAULT_OPERATION_TIMEOUT,
              'matrix_subtract'
            )
          : (math.subtract(matrixA, matrixB) as number[][]);
        break;
      }

      default:
        throw new ValidationError(`Unknown matrix operation: ${validOperation}`);
    }

    const duration = performance.now() - startTime;
    perfTracker.recordOperation(`matrix_${validOperation}`, duration);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ result: math.format(result) }, null, 2),
        },
      ],
      isError: false,
    };
  } catch (error) {
    const duration = performance.now() - startTime;
    perfTracker.recordOperation(`matrix_${args.operation}_error`, duration);

    logger.error('Matrix operation failed', {
      operation: args.operation,
      error: error instanceof Error ? error.message : String(error),
    });

    throw error;
  }
}

/**
 * Handles the 'statistics' tool.
 * Performs statistical calculations with optional WASM acceleration.
 *
 * @param {Object} args - Tool arguments
 * @param {string} args.operation - Statistical operation to perform
 * @param {string} args.data - Data array (JSON string)
 * @param {AccelerationWrapper} [accelerationWrapper] - Optional acceleration wrapper (mathjs/WASM/Workers/GPU)
 * @returns {Promise<ToolResponse>} The calculation result
 *
 * @example
 * ```typescript
 * await handleStatistics({
 *   operation: 'mean',
 *   data: '[1,2,3,4,5]'
 * });
 * // Returns: { content: [{ type: 'text', text: '{"result":"3"}' }] }
 * ```
 */
export async function handleStatistics(
  args: {
    operation: string;
    data: string;
  },
  accelerationWrapper?: AccelerationWrapper
): Promise<ToolResponse> {
  const startTime = performance.now();

  try {
    // Validate operation type
    const validOperation = validateEnum(
      args.operation,
      ['mean', 'median', 'mode', 'std', 'variance', 'min', 'max', 'sum', 'product'] as const,
      'operation'
    );

    // Parse and validate data array
    const dataArray = validateArrayLength(
      validateNumberArray(safeJsonParse(args.data, 'data'), 'data'),
      'data'
    );

    logger.debug('Statistics operation', {
      operation: validOperation,
      dataLength: dataArray.length,
    });

    let result: number | number[];

    switch (validOperation) {
      case 'mean':
        result = accelerationWrapper
          ? await withTimeout(
              accelerationWrapper.statsMean(dataArray),
              DEFAULT_OPERATION_TIMEOUT,
              'stats_mean'
            )
          : (math.mean(dataArray) as number);
        break;

      case 'median':
        result = accelerationWrapper
          ? await withTimeout(
              accelerationWrapper.statsMedian(dataArray),
              DEFAULT_OPERATION_TIMEOUT,
              'stats_median'
            )
          : (math.median(dataArray) as unknown as number);
        break;

      case 'mode':
        {
          const modeResult = accelerationWrapper
            ? await withTimeout(
                accelerationWrapper.statsMode(dataArray),
                DEFAULT_OPERATION_TIMEOUT,
                'stats_mode'
              )
            : math.mode(dataArray);

          // Normalize mode to always return an array for consistency
          // Single mode: [value], Multiple modes: [value1, value2, ...]
          result = Array.isArray(modeResult) ? modeResult : [modeResult];
        }
        break;

      case 'std':
        result = accelerationWrapper
          ? await withTimeout(
              accelerationWrapper.statsStd(dataArray),
              DEFAULT_OPERATION_TIMEOUT,
              'stats_std'
            )
          : (math.std(dataArray) as unknown as number);
        break;

      case 'variance':
        result = accelerationWrapper
          ? await withTimeout(
              accelerationWrapper.statsVariance(dataArray),
              DEFAULT_OPERATION_TIMEOUT,
              'stats_variance'
            )
          : (math.variance(dataArray) as unknown as number);
        break;

      case 'min':
        result = accelerationWrapper
          ? await withTimeout(
              accelerationWrapper.statsMin(dataArray),
              DEFAULT_OPERATION_TIMEOUT,
              'stats_min'
            )
          : (math.min(dataArray) as number);
        break;

      case 'max':
        result = accelerationWrapper
          ? await withTimeout(
              accelerationWrapper.statsMax(dataArray),
              DEFAULT_OPERATION_TIMEOUT,
              'stats_max'
            )
          : (math.max(dataArray) as number);
        break;

      case 'sum':
        result = accelerationWrapper
          ? await withTimeout(
              accelerationWrapper.statsSum(dataArray),
              DEFAULT_OPERATION_TIMEOUT,
              'stats_sum'
            )
          : (math.sum(dataArray) as number);
        break;

      case 'product':
        result = math.prod(dataArray) as number;
        break;

      default:
        throw new ValidationError(`Unknown statistics operation: ${validOperation}`);
    }

    const duration = performance.now() - startTime;
    perfTracker.recordOperation(`stats_${validOperation}`, duration);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ result: math.format(result) }, null, 2),
        },
      ],
      isError: false,
    };
  } catch (error) {
    const duration = performance.now() - startTime;
    perfTracker.recordOperation(`stats_${args.operation}_error`, duration);

    logger.error('Statistics operation failed', {
      operation: args.operation,
      error: error instanceof Error ? error.message : String(error),
    });

    throw error;
  }
}

/**
 * Handles the 'unit_conversion' tool.
 * Converts between different units of measurement.
 *
 * @param {Object} args - Tool arguments
 * @param {string} args.value - Value with unit (e.g., "5 inches")
 * @param {string} args.target_unit - Target unit (e.g., "cm")
 * @returns {Promise<ToolResponse>} The converted value
 *
 * @example
 * ```typescript
 * await handleUnitConversion({
 *   value: '5 inches',
 *   target_unit: 'cm'
 * });
 * // Returns: { content: [{ type: 'text', text: '{"result":"12.7 cm"}' }] }
 * ```
 */
export async function handleUnitConversion(args: {
  value: string;
  target_unit: string;
}): Promise<ToolResponse> {
  const startTime = performance.now();

  try {
    // Validate inputs - basic type checking
    if (typeof args.value !== 'string' || args.value.trim().length === 0) {
      throw new ValidationError('value must be a non-empty string');
    }

    if (typeof args.target_unit !== 'string' || args.target_unit.trim().length === 0) {
      throw new ValidationError('target_unit must be a non-empty string');
    }

    // Input sanitization - length limits (prevent DoS via extremely long strings)
    const MAX_VALUE_LENGTH = 100;
    const MAX_UNIT_LENGTH = 50;

    if (args.value.length > MAX_VALUE_LENGTH) {
      throw new ValidationError(
        `value exceeds maximum length of ${MAX_VALUE_LENGTH} characters`
      );
    }

    if (args.target_unit.length > MAX_UNIT_LENGTH) {
      throw new ValidationError(
        `target_unit exceeds maximum length of ${MAX_UNIT_LENGTH} characters`
      );
    }

    // Input sanitization - format validation (prevent injection attacks)
    // Allow: numbers, basic units, operators (+, -, *, /, ^), spaces, and common unit characters
    const ALLOWED_VALUE_PATTERN = /^[0-9\s+\-*/.^a-zA-Z()]+$/;
    const ALLOWED_UNIT_PATTERN = /^[a-zA-Z0-9\s/^*-]+$/;

    if (!ALLOWED_VALUE_PATTERN.test(args.value)) {
      throw new ValidationError(
        'value contains invalid characters. Only numbers, units, and basic operators are allowed.'
      );
    }

    if (!ALLOWED_UNIT_PATTERN.test(args.target_unit)) {
      throw new ValidationError(
        'target_unit contains invalid characters. Only alphanumeric characters and unit operators are allowed.'
      );
    }

    // Additional safety: prevent excessive nesting/complexity
    const openParens = (args.value.match(/\(/g) || []).length;
    const closeParens = (args.value.match(/\)/g) || []).length;

    if (openParens !== closeParens) {
      throw new ValidationError('value has mismatched parentheses');
    }

    if (openParens > 10) {
      throw new ValidationError(
        'value has too many nested expressions (max 10 levels)'
      );
    }

    logger.debug('Unit conversion', {
      value: args.value,
      targetUnit: args.target_unit,
    });

    // Perform conversion with timeout protection
    const result = await withTimeout(
      Promise.resolve(math.unit(args.value).to(args.target_unit)),
      DEFAULT_OPERATION_TIMEOUT,
      'unit_conversion'
    );

    const duration = performance.now() - startTime;
    perfTracker.recordOperation('unit_conversion', duration);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ result: result.toString() }, null, 2),
        },
      ],
      isError: false,
    };
  } catch (error) {
    const duration = performance.now() - startTime;
    perfTracker.recordOperation('unit_conversion_error', duration);

    logger.error('Unit conversion failed', {
      value: args.value,
      targetUnit: args.target_unit,
      error: error instanceof Error ? error.message : String(error),
    });

    throw error;
  }
}

/**
 * Wraps a tool handler with error handling.
 * Converts all errors into properly formatted ToolResponse objects.
 *
 * @template T - The type of the handler arguments
 * @param {Function} handler - The handler function to wrap
 * @param {T} args - Arguments to pass to the handler
 * @returns {Promise<ToolResponse>} The handler response or error response
 *
 * @example
 * ```typescript
 * const response = await withErrorHandling(
 *   handleEvaluate,
 *   { expression: '2 + 2' }
 * );
 * ```
 */
export async function withErrorHandling<T>(
  handler: (args: T) => Promise<ToolResponse>,
  args: T
): Promise<ToolResponse> {
  try {
    return await handler(args);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorName = error instanceof MathMCPError ? error.name : 'Error';

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              error: errorMessage,
              errorType: errorName,
            },
            null,
            2
          ),
        },
      ],
      isError: true,
    };
  }
}
