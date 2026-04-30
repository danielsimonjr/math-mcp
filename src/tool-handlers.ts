/**
 * @file tool-handlers.ts
 * @description Tool handler implementations for the Math MCP Server
 *
 * Each handler validates inputs, executes with timeout protection,
 * and returns properly formatted responses.
 *
 * @module tool-handlers
 * @since 2.1.0 (refactored 3.3.0)
 */

import math from './mathjs-shim.js';
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
import { ValidationError } from './errors.js';
import { withTimeout, DEFAULT_OPERATION_TIMEOUT } from './utils.js';
import { getCachedExpression } from './expression-cache.js';
import {
  executeHandler,
  successResponse,
  withErrorHandling as baseWithErrorHandling,
  type ToolResponse,
} from './handler-utils.js';

// Re-export for backward compatibility
export { ToolResponse, withErrorHandling } from './handler-utils.js';

/** Acceleration wrapper for WASM/Workers/GPU operations */
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

/** @deprecated Use AccelerationWrapper instead */
export type WasmWrapper = AccelerationWrapper;

// ============================================================================
// Safe Expression Evaluation
// ============================================================================

const ALLOWED_NODE_TYPES = new Set([
  'ConstantNode', 'SymbolNode', 'OperatorNode', 'ParenthesisNode',
  'FunctionNode', 'ArrayNode', 'AccessorNode', 'IndexNode', 'RangeNode',
]);

const FORBIDDEN_FUNCTIONS = new Set([
  'import', 'createUnit', 'evaluate', 'parse', 'compile', 'help',
]);

function validateNode(n: any): void {
  if (!n?.type) return;

  if (!ALLOWED_NODE_TYPES.has(n.type)) {
    throw new ValidationError(`Unsafe operation detected: ${n.type} is not allowed`);
  }

  if (n.type === 'FunctionNode' && FORBIDDEN_FUNCTIONS.has(n.fn?.name || n.name)) {
    throw new ValidationError(`Function '${n.fn?.name || n.name}' is not allowed`);
  }

  if (n.type === 'AssignmentNode' || n.type === 'FunctionAssignmentNode') {
    throw new ValidationError('Assignment operations are not allowed');
  }

  // Recursively validate children
  n.args?.forEach?.(validateNode);
  n.content && validateNode(n.content);
  n.index && validateNode(n.index);
  n.items?.forEach?.(validateNode);
  n.blocks?.forEach?.((b: any) => b.node && validateNode(b.node));
}

function safeEvaluate(expression: string, scope: Record<string, number>): any {
  const compiled = getCachedExpression(
    expression,
    () => {
      const node = math.parse(expression);
      validateNode(node);
      return node.compile();
    },
    scope
  );
  return compiled.evaluate(scope);
}

// ============================================================================
// Tool Handlers
// ============================================================================

/** Evaluates mathematical expressions */
export async function handleEvaluate(args: {
  expression: string;
  scope?: object;
}): Promise<ToolResponse> {
  return executeHandler(
    { operationName: 'evaluate', logContext: { expression: args.expression, hasScope: !!args.scope } },
    async () => {
      const expr = validateExpression(args.expression, 'expression');
      const scope = args.scope ? validateScope(args.scope, 'scope') : {};
      const result = await withTimeout(
        Promise.resolve(safeEvaluate(expr, scope)),
        DEFAULT_OPERATION_TIMEOUT, 'evaluate'
      );
      return successResponse(math.format(result));
    }
  );
}

/** Simplifies mathematical expressions */
export async function handleSimplify(args: {
  expression: string;
  rules?: string[];
}): Promise<ToolResponse> {
  return executeHandler(
    { operationName: 'simplify', logContext: { expression: args.expression } },
    async () => {
      const expr = validateExpression(args.expression, 'expression');
      const simplified = await withTimeout(
        Promise.resolve(args.rules ? math.simplify(expr, args.rules) : math.simplify(expr)),
        DEFAULT_OPERATION_TIMEOUT, 'simplify'
      );
      return successResponse(simplified.toString());
    }
  );
}

/** Calculates derivatives */
export async function handleDerivative(args: {
  expression: string;
  variable: string;
}): Promise<ToolResponse> {
  return executeHandler(
    { operationName: 'derivative', logContext: { expression: args.expression, variable: args.variable } },
    async () => {
      const expr = validateExpression(args.expression, 'expression');
      const varName = validateVariableName(args.variable, 'variable');
      const result = await withTimeout(
        Promise.resolve(math.derivative(expr, varName)),
        DEFAULT_OPERATION_TIMEOUT, 'derivative'
      );
      return successResponse(result.toString());
    }
  );
}

/** Solves equations */
export async function handleSolve(args: {
  equation: string;
  variable: string;
}): Promise<ToolResponse> {
  return executeHandler(
    { operationName: 'solve', logContext: { equation: args.equation, variable: args.variable } },
    async () => {
      const equation = validateExpression(args.equation, 'equation');
      const varName = validateVariableName(args.variable, 'variable');

      const parts = equation.split('=');
      if (parts.length !== 2) {
        throw new ValidationError("Equation must contain exactly one '=' sign");
      }

      const expr = `${parts[0].trim()} - (${parts[1].trim()})`;

      // Validate compilable
      getCachedExpression(expr, () => math.parse(expr).compile());

      let result: string;
      try {
        const simplified = math.simplify(expr);
        result = `Simplified equation: ${simplified.toString()} = 0`;
      } catch {
        result = `Expression to solve: ${expr} = 0 for ${varName}`;
      }

      return successResponse(result);
    }
  );
}

// ============================================================================
// Matrix Operations
// ============================================================================

type MatrixOp = 'multiply' | 'inverse' | 'determinant' | 'transpose' | 'eigenvalues' | 'add' | 'subtract';

const matrixOps: Record<MatrixOp, (
  a: number[][],
  b: number[][] | undefined,
  accel?: AccelerationWrapper
) => Promise<unknown>> = {
  multiply: async (a, b, accel) => {
    if (!b) throw new ValidationError('matrix_b is required for multiply');
    validateMatrixCompatibility(a, b, 'multiply');
    return accel
      ? withTimeout(accel.matrixMultiply(a, b), DEFAULT_OPERATION_TIMEOUT, 'matrix_multiply')
      : math.multiply(a, b);
  },
  inverse: async (a) => {
    validateSquareMatrix(a, 'matrix_a');
    return math.inv(a);
  },
  determinant: async (a, _, accel) => {
    validateSquareMatrix(a, 'matrix_a');
    return accel
      ? withTimeout(accel.matrixDeterminant(a), DEFAULT_OPERATION_TIMEOUT, 'matrix_determinant')
      : math.det(a);
  },
  transpose: async (a, _, accel) => {
    return accel
      ? withTimeout(accel.matrixTranspose(a), DEFAULT_OPERATION_TIMEOUT, 'matrix_transpose')
      : math.transpose(a);
  },
  eigenvalues: async (a) => {
    validateSquareMatrix(a, 'matrix_a');
    return math.eigs(a).values;
  },
  add: async (a, b, accel) => {
    if (!b) throw new ValidationError('matrix_b is required for add');
    validateMatrixCompatibility(a, b, 'add');
    return accel
      ? withTimeout(accel.matrixAdd(a, b), DEFAULT_OPERATION_TIMEOUT, 'matrix_add')
      : math.add(a, b);
  },
  subtract: async (a, b, accel) => {
    if (!b) throw new ValidationError('matrix_b is required for subtract');
    validateMatrixCompatibility(a, b, 'subtract');
    return accel
      ? withTimeout(accel.matrixSubtract(a, b), DEFAULT_OPERATION_TIMEOUT, 'matrix_subtract')
      : math.subtract(a, b);
  },
};

/** Performs matrix operations */
export async function handleMatrixOperations(
  args: { operation: string; matrix_a: string; matrix_b?: string },
  accelerationWrapper?: AccelerationWrapper
): Promise<ToolResponse> {
  const op = validateEnum(args.operation, Object.keys(matrixOps) as MatrixOp[], 'operation');

  return executeHandler(
    { operationName: `matrix_${op}`, logContext: { operation: op } },
    async () => {
      const matrixA = validateMatrixSize(
        validateMatrix(safeJsonParse(args.matrix_a, 'matrix_a'), 'matrix_a'),
        'matrix_a'
      );
      const matrixB = args.matrix_b
        ? validateMatrixSize(validateMatrix(safeJsonParse(args.matrix_b, 'matrix_b'), 'matrix_b'), 'matrix_b')
        : undefined;

      const result = await matrixOps[op](matrixA, matrixB, accelerationWrapper);
      return successResponse(math.format(result));
    }
  );
}

// ============================================================================
// Statistics Operations
// ============================================================================

type StatsOp = 'mean' | 'median' | 'mode' | 'std' | 'variance' | 'min' | 'max' | 'sum' | 'product';

const statsOps: Record<StatsOp, (data: number[], accel?: AccelerationWrapper) => Promise<unknown>> = {
  mean: async (data, accel) =>
    accel ? withTimeout(accel.statsMean(data), DEFAULT_OPERATION_TIMEOUT, 'stats_mean') : math.mean(data),
  median: async (data, accel) =>
    accel ? withTimeout(accel.statsMedian(data), DEFAULT_OPERATION_TIMEOUT, 'stats_median') : math.median(data),
  mode: async (data, accel) => {
    const result = accel
      ? await withTimeout(accel.statsMode(data), DEFAULT_OPERATION_TIMEOUT, 'stats_mode')
      : math.mode(data);
    return Array.isArray(result) ? result : [result];
  },
  std: async (data, accel) =>
    accel ? withTimeout(accel.statsStd(data), DEFAULT_OPERATION_TIMEOUT, 'stats_std') : math.std(data),
  variance: async (data, accel) =>
    accel ? withTimeout(accel.statsVariance(data), DEFAULT_OPERATION_TIMEOUT, 'stats_variance') : math.variance(data),
  min: async (data, accel) =>
    accel ? withTimeout(accel.statsMin(data), DEFAULT_OPERATION_TIMEOUT, 'stats_min') : math.min(data),
  max: async (data, accel) =>
    accel ? withTimeout(accel.statsMax(data), DEFAULT_OPERATION_TIMEOUT, 'stats_max') : math.max(data),
  sum: async (data, accel) =>
    accel ? withTimeout(accel.statsSum(data), DEFAULT_OPERATION_TIMEOUT, 'stats_sum') : math.sum(data),
  product: async (data) => math.prod(data),
};

/** Performs statistical calculations */
export async function handleStatistics(
  args: { operation: string; data: string },
  accelerationWrapper?: AccelerationWrapper
): Promise<ToolResponse> {
  const op = validateEnum(args.operation, Object.keys(statsOps) as StatsOp[], 'operation');

  return executeHandler(
    { operationName: `stats_${op}`, logContext: { operation: op } },
    async () => {
      const data = validateArrayLength(
        validateNumberArray(safeJsonParse(args.data, 'data'), 'data'),
        'data'
      );
      const result = await statsOps[op](data, accelerationWrapper);
      return successResponse(math.format(result));
    }
  );
}

// ============================================================================
// Unit Conversion
// ============================================================================

const UNIT_LIMITS = { value: 100, unit: 50, parens: 10 };
const UNIT_PATTERNS = {
  value: /^[0-9\s+\-*/.^a-zA-Z()]+$/,
  unit: /^[a-zA-Z0-9\s/^*-]+$/,
};

/** Converts between units of measurement */
export async function handleUnitConversion(args: {
  value: string;
  target_unit: string;
}): Promise<ToolResponse> {
  return executeHandler(
    { operationName: 'unit_conversion', logContext: { value: args.value, targetUnit: args.target_unit } },
    async () => {
      // Validate inputs
      if (typeof args.value !== 'string' || !args.value.trim()) {
        throw new ValidationError('value must be a non-empty string');
      }
      if (typeof args.target_unit !== 'string' || !args.target_unit.trim()) {
        throw new ValidationError('target_unit must be a non-empty string');
      }

      // Length limits
      if (args.value.length > UNIT_LIMITS.value) {
        throw new ValidationError(`value exceeds maximum length of ${UNIT_LIMITS.value}`);
      }
      if (args.target_unit.length > UNIT_LIMITS.unit) {
        throw new ValidationError(`target_unit exceeds maximum length of ${UNIT_LIMITS.unit}`);
      }

      // Pattern validation
      if (!UNIT_PATTERNS.value.test(args.value)) {
        throw new ValidationError('value contains invalid characters');
      }
      if (!UNIT_PATTERNS.unit.test(args.target_unit)) {
        throw new ValidationError('target_unit contains invalid characters');
      }

      // Parentheses validation
      const openParens = (args.value.match(/\(/g) || []).length;
      const closeParens = (args.value.match(/\)/g) || []).length;
      if (openParens !== closeParens) {
        throw new ValidationError('value has mismatched parentheses');
      }
      if (openParens > UNIT_LIMITS.parens) {
        throw new ValidationError(`value has too many nested expressions (max ${UNIT_LIMITS.parens})`);
      }

      const result = await withTimeout(
        Promise.resolve(math.unit(args.value).to(args.target_unit)),
        DEFAULT_OPERATION_TIMEOUT, 'unit_conversion'
      );

      return successResponse(result.toString());
    }
  );
}
