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

import math from './math-engine.js';
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
  type ToolResponse,
} from './handler-utils.js';

// Re-export for backward compatibility
export { ToolResponse, withErrorHandling } from './handler-utils.js';

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
  if (n.content) validateNode(n.content);
  if (n.index) validateNode(n.index);
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

// ============================================================================
// Equation Solver (self-contained)
//
// MathTS/mathjs provide no general symbolic solver, and the engine's built-in
// `polynomialRoot` is not reliably reachable through the compat instance (its
// cubic branch needs a variadic `add` that create(all) does not wire into the
// dependency graph). So solving is done here in plain TypeScript:
//   • polynomials of degree <= 3   -> exact closed-form roots (real + complex)
//   • degree >= 4 / transcendental -> numeric real-root scan over a bounded
//     window (sign-change bisection + Newton polish)
// Coefficient extraction uses only `math.parse` + `math.derivative` (verified
// working); no dependence on the engine's variadic arithmetic or Complex type.
// ============================================================================

interface SolverRoot {
  re: number;
  im: number;
}

const SOLVE_WINDOW_LO = -100;
const SOLVE_WINDOW_HI = 100;
const SOLVE_SCAN_STEP = 0.05;

/** Format a real number: collapse near-integers, trim float noise. */
function fmtReal(x: number): string {
  if (!Number.isFinite(x)) return String(x);
  const rounded = Math.round(x);
  if (Math.abs(x - rounded) < 1e-9) return String(rounded);
  return parseFloat(x.toFixed(10)).toString();
}

/** Format a (possibly complex) root as a + bi. */
function fmtRoot(root: SolverRoot): string {
  const reZero = Math.abs(root.re) < 1e-9;
  const imZero = Math.abs(root.im) < 1e-9;
  if (imZero) return fmtReal(root.re);
  const imAbs = Math.abs(root.im);
  const imMag = Math.abs(imAbs - 1) < 1e-9 ? '' : fmtReal(imAbs);
  if (reZero) return `${root.im < 0 ? '-' : ''}${imMag}i`;
  return `${fmtReal(root.re)} ${root.im < 0 ? '-' : '+'} ${imMag}i`;
}

/** Real-valued cube root (handles negatives). */
function realCbrt(x: number): number {
  return x < 0 ? -Math.pow(-x, 1 / 3) : Math.pow(x, 1 / 3);
}

/** Exact roots of a x^2 + b x + c (a != 0). */
function solveQuadratic(a: number, b: number, c: number): SolverRoot[] {
  const disc = b * b - 4 * a * c;
  if (disc >= 0) {
    const s = Math.sqrt(disc);
    return [
      { re: (-b + s) / (2 * a), im: 0 },
      { re: (-b - s) / (2 * a), im: 0 },
    ];
  }
  const s = Math.sqrt(-disc);
  return [
    { re: -b / (2 * a), im: s / (2 * a) },
    { re: -b / (2 * a), im: -s / (2 * a) },
  ];
}

/** Exact roots of a x^3 + b x^2 + c x + d (a != 0), via Cardano/trig. */
function solveCubic(a: number, b: number, c: number, d: number): SolverRoot[] {
  const B = b / a;
  const C = c / a;
  const D = d / a;
  // Depressed cubic t^3 + p t + q with substitution x = t - B/3.
  const p = C - (B * B) / 3;
  const q = (2 * B * B * B) / 27 - (B * C) / 3 + D;
  const shift = -B / 3;
  const disc = (q * q) / 4 + (p * p * p) / 27;

  if (Math.abs(disc) < 1e-12) {
    // Repeated real roots.
    if (Math.abs(p) < 1e-12 && Math.abs(q) < 1e-12) {
      return [{ re: shift, im: 0 }];
    }
    const u = realCbrt(-q / 2);
    return [
      { re: 2 * u + shift, im: 0 },
      { re: -u + shift, im: 0 },
    ];
  }

  if (disc > 0) {
    // One real root, two complex conjugates.
    const sq = Math.sqrt(disc);
    const u = realCbrt(-q / 2 + sq);
    const v = realCbrt(-q / 2 - sq);
    const realPart = -(u + v) / 2 + shift;
    const imagPart = ((u - v) * Math.sqrt(3)) / 2;
    return [
      { re: u + v + shift, im: 0 },
      { re: realPart, im: imagPart },
      { re: realPart, im: -imagPart },
    ];
  }

  // disc < 0: three distinct real roots (trigonometric form, p < 0 here).
  const m = 2 * Math.sqrt(-p / 3);
  let arg = ((3 * q) / (2 * p)) * Math.sqrt(-3 / p);
  arg = Math.max(-1, Math.min(1, arg));
  const theta = Math.acos(arg) / 3;
  return [0, 1, 2].map((k) => ({
    re: m * Math.cos(theta - (2 * Math.PI * k) / 3) + shift,
    im: 0,
  }));
}

/**
 * Try to read polynomial coefficients [c0, c1, c2, c3] of f in `varName`,
 * confirming degree <= 3. Returns null if f is not a polynomial of degree <= 3
 * (or derivatives can't be taken). Uses Taylor coefficients f^(k)(0)/k! and
 * validates by reconstructing f at sample points.
 */
function extractPolyCoeffs(exprNode: unknown, varName: string): number[] | null {
  const evalAt = (node: any, x: number): number => {
    const v = node.evaluate({ [varName]: x });
    return typeof v === 'number' ? v : NaN;
  };
  try {
    const derivs: any[] = [exprNode];
    for (let k = 1; k <= 4; k++) {
      derivs.push(math.derivative(derivs[k - 1], varName));
    }
    // The 4th derivative must vanish everywhere for degree <= 3.
    for (const x of [-3.1, -1.3, 0.7, 2.9, 5.3]) {
      if (Math.abs(evalAt(derivs[4], x)) > 1e-6) return null;
    }
    const fact = [1, 1, 2, 6];
    const coeffs = [0, 1, 2, 3].map((k) => evalAt(derivs[k], 0) / fact[k]);
    if (coeffs.some((c) => !Number.isFinite(c))) return null;
    // Validate reconstruction against the original function.
    for (const x of [-2.5, -0.7, 1.3, 3.1, 4.7]) {
      const recon = coeffs[0] + coeffs[1] * x + coeffs[2] * x * x + coeffs[3] * x * x * x;
      const actual = evalAt(exprNode, x);
      if (!Number.isFinite(actual)) return null;
      const tol = 1e-6 * (1 + Math.abs(actual));
      if (Math.abs(recon - actual) > tol) return null;
    }
    return coeffs;
  } catch {
    return null;
  }
}

/** Numeric real-root finder over the bounded window (sign change + bisection + Newton). */
function numericRealRoots(exprNode: unknown, varName: string): number[] {
  const f = (x: number): number => {
    try {
      const v = (exprNode as any).evaluate({ [varName]: x });
      return typeof v === 'number' ? v : NaN;
    } catch {
      return NaN;
    }
  };
  const found: number[] = [];
  const addRoot = (r: number): void => {
    if (!Number.isFinite(r) || r < SOLVE_WINDOW_LO - 1 || r > SOLVE_WINDOW_HI + 1) return;
    if (found.some((e) => Math.abs(e - r) < 1e-6)) return;
    found.push(r);
  };
  const newton = (x0: number): number => {
    let x = x0;
    for (let i = 0; i < 20; i++) {
      const fx = f(x);
      if (!Number.isFinite(fx)) break;
      const h = 1e-6 * (1 + Math.abs(x));
      const dfx = (f(x + h) - f(x - h)) / (2 * h);
      if (!Number.isFinite(dfx) || Math.abs(dfx) < 1e-14) break;
      const next = x - fx / dfx;
      if (!Number.isFinite(next)) break;
      if (Math.abs(next - x) < 1e-12) return next;
      x = next;
    }
    return x;
  };

  let prevX = SOLVE_WINDOW_LO;
  let prevY = f(prevX);
  for (let x = SOLVE_WINDOW_LO + SOLVE_SCAN_STEP; x <= SOLVE_WINDOW_HI + 1e-9; x += SOLVE_SCAN_STEP) {
    const y = f(x);
    if (prevY === 0) addRoot(prevX);
    if (Number.isFinite(prevY) && Number.isFinite(y) && prevY * y < 0) {
      let a = prevX;
      let b = x;
      let fa = prevY;
      for (let i = 0; i < 100 && Math.abs(b - a) > 1e-12; i++) {
        const mid = (a + b) / 2;
        const fm = f(mid);
        if (fm === 0) {
          a = mid;
          b = mid;
          break;
        }
        if (fa * fm < 0) {
          b = mid;
        } else {
          a = mid;
          fa = fm;
        }
      }
      const refined = newton((a + b) / 2);
      // Accept the Newton result only if it stays a root and inside the bracket-ish region.
      addRoot(Math.abs(f(refined)) <= Math.abs(f((a + b) / 2)) + 1e-9 ? refined : (a + b) / 2);
    }
    prevX = x;
    prevY = y;
  }
  if (prevY === 0) addRoot(prevX);
  found.sort((p, q) => p - q);
  return found;
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

      // Parse + security-validate, and prime the shared expression cache with a
      // validated compile (same key handleEvaluate uses) so it is never primed
      // with an unvalidated compile.
      const node = math.parse(expr);
      validateNode(node);
      getCachedExpression(expr, () => node.compile());

      const standardForm = (): string => {
        try {
          return `${math.simplify(expr).toString()} = 0`;
        } catch {
          return `${expr} = 0`;
        }
      };

      // Detect free variables other than the one being solved for: if the
      // equation cannot be evaluated numerically in `varName` alone, we can't
      // solve it — report the standard form instead.
      const probe = (x: number): { ok: boolean; undefinedSymbol: boolean } => {
        try {
          const v = node.evaluate({ [varName]: x });
          return { ok: typeof v === 'number' && Number.isFinite(v), undefinedSymbol: false };
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return { ok: false, undefinedSymbol: /undefined symbol|not defined|undefined variable/i.test(msg) };
        }
      };
      const probes = [0.37, 1.51, -0.91, 2.73].map(probe);
      if (probes.every((p) => !p.ok)) {
        if (probes.some((p) => p.undefinedSymbol)) {
          return successResponse(
            `Cannot solve: the equation contains unknowns other than '${varName}'. ` +
              `This solver handles a single variable. Standard form: ${standardForm()}`
          );
        }
        return successResponse(
          `Could not evaluate the equation as a real function of '${varName}'. ` +
            `Standard form: ${standardForm()}`
        );
      }

      // --- Analytic path: polynomial of degree <= 3 ------------------------
      const coeffs = extractPolyCoeffs(node, varName);
      if (coeffs) {
        const [c0, c1, c2, c3] = coeffs;
        const eps = 1e-9;
        let degree = 0;
        if (Math.abs(c3) > eps) degree = 3;
        else if (Math.abs(c2) > eps) degree = 2;
        else if (Math.abs(c1) > eps) degree = 1;

        if (degree === 0) {
          return successResponse(
            Math.abs(c0) < eps
              ? `All real numbers are solutions of ${varName} (identity).`
              : `No solution: the equation reduces to a non-zero constant.`
          );
        }

        let roots: SolverRoot[];
        if (degree === 1) roots = [{ re: -c0 / c1, im: 0 }];
        else if (degree === 2) roots = solveQuadratic(c2, c1, c0);
        else roots = solveCubic(c3, c2, c1, c0);

        const label = roots.length === 1 ? 'Solution' : 'Solutions';
        return successResponse(`${label}: ${roots.map((r) => `${varName} = ${fmtRoot(r)}`).join(', ')}`);
      }

      // --- Numeric path: degree >= 4 or transcendental ---------------------
      const numeric = numericRealRoots(node, varName);
      if (numeric.length > 0) {
        const MAX_REPORTED = 10;
        const label = numeric.length === 1 ? 'Solution' : 'Solutions';
        // When capping, prefer the roots nearest the origin (most useful for
        // periodic equations), then present them in ascending order.
        const shown =
          numeric.length <= MAX_REPORTED
            ? numeric
            : [...numeric]
                .sort((a, b) => Math.abs(a) - Math.abs(b))
                .slice(0, MAX_REPORTED)
                .sort((a, b) => a - b);
        const omitted = numeric.length - shown.length;
        let msg =
          `${label} (numeric, real roots in [${SOLVE_WINDOW_LO}, ${SOLVE_WINDOW_HI}]): ` +
          shown.map((r) => `${varName} ≈ ${fmtReal(r)}`).join(', ');
        if (omitted > 0) {
          msg +=
            ` … and ${omitted} more (the equation has many roots in this window — ` +
            `likely periodic; showing the first ${MAX_REPORTED}).`;
        }
        return successResponse(msg);
      }

      return successResponse(
        `No real solutions found in [${SOLVE_WINDOW_LO}, ${SOLVE_WINDOW_HI}] ` +
          `(complex or out-of-range roots are not searched for non-polynomial equations). ` +
          `Standard form: ${standardForm()}`
      );
    }
  );
}

// ============================================================================
// Matrix Operations
// ============================================================================

type MatrixOp = 'multiply' | 'inverse' | 'determinant' | 'transpose' | 'eigenvalues' | 'add' | 'subtract';

// Matrix operations call MathTS directly; MathTS performs its own internal
// tier dispatch (WASM → ComputePool → JS) per operation/size, so math-mcp no
// longer wires a bespoke acceleration layer.
const matrixOps: Record<MatrixOp, (a: number[][], b: number[][] | undefined) => unknown> = {
  multiply: (a, b) => {
    if (!b) throw new ValidationError('matrix_b is required for multiply');
    validateMatrixCompatibility(a, b, 'multiply');
    return math.multiply(a, b);
  },
  inverse: (a) => {
    validateSquareMatrix(a, 'matrix_a');
    return math.inv(a);
  },
  determinant: (a) => {
    validateSquareMatrix(a, 'matrix_a');
    return math.det(a);
  },
  transpose: (a) => math.transpose(a),
  eigenvalues: (a) => {
    validateSquareMatrix(a, 'matrix_a');
    return math.eigs(a).values;
  },
  add: (a, b) => {
    if (!b) throw new ValidationError('matrix_b is required for add');
    validateMatrixCompatibility(a, b, 'add');
    return math.add(a, b);
  },
  subtract: (a, b) => {
    if (!b) throw new ValidationError('matrix_b is required for subtract');
    validateMatrixCompatibility(a, b, 'subtract');
    return math.subtract(a, b);
  },
};

/** Performs matrix operations */
export async function handleMatrixOperations(
  args: { operation: string; matrix_a: string; matrix_b?: string }
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

      const result = matrixOps[op](matrixA, matrixB);
      return successResponse(math.format(result));
    }
  );
}

// ============================================================================
// Statistics Operations
// ============================================================================

type StatsOp = 'mean' | 'median' | 'mode' | 'std' | 'variance' | 'min' | 'max' | 'sum' | 'product';

const statsOps: Record<StatsOp, (data: number[]) => unknown> = {
  mean: (data) => math.mean(data),
  median: (data) => math.median(data),
  mode: (data) => {
    const result = math.mode(data);
    return Array.isArray(result) ? result : [result];
  },
  std: (data) => math.std(data),
  variance: (data) => math.variance(data),
  min: (data) => math.min(data),
  max: (data) => math.max(data),
  sum: (data) => math.sum(data),
  product: (data) => math.prod(data),
};

/** Performs statistical calculations */
export async function handleStatistics(
  args: { operation: string; data: string }
): Promise<ToolResponse> {
  const op = validateEnum(args.operation, Object.keys(statsOps) as StatsOp[], 'operation');

  return executeHandler(
    { operationName: `stats_${op}`, logContext: { operation: op } },
    async () => {
      const data = validateArrayLength(
        validateNumberArray(safeJsonParse(args.data, 'data'), 'data'),
        'data'
      );
      const result = statsOps[op](data);
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
