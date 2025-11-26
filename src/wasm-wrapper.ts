/**
 * @file wasm-wrapper.ts
 * @description WASM wrapper with automatic fallback to mathjs
 *
 * Provides transparent routing to WASM (large inputs) or mathjs (small inputs).
 * Performance: Matrix ops up to 17x faster, stats up to 42x faster for large data.
 *
 * @module wasm-wrapper
 * @since 2.0.0 (refactored 3.3.0)
 */

import * as math from 'mathjs';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';
import { logger } from './utils.js';
import { verifyWasmIntegrity, isIntegrityCheckEnabled } from './wasm-integrity.js';
import {
  executeUnaryOp,
  executeBinaryOp,
  getPerfStats as getExecutorPerfStats,
  resetPerfCounters as resetExecutorPerfCounters,
  type UnaryOperationConfig,
  type BinaryOperationConfig,
} from './wasm-executor.js';

// ============================================================================
// Thresholds
// ============================================================================

/** Performance thresholds for WASM usage (benchmarked values). */
export const THRESHOLDS = {
  matrix_multiply: 10,  // 8x speedup at 10x10
  matrix_det: 5,        // 17x speedup at 5x5
  matrix_transpose: 20, // 2x speedup at 20x20
  statistics: 100,      // 15-42x speedup at 100+ elements
  median: 50,           // Lower threshold due to sorting
} as const;

// ============================================================================
// WASM Module Interfaces
// ============================================================================

interface WasmMatrixModule {
  multiply(a: number[][], b: number[][]): number[][];
  det(matrix: number[][]): number;
  transpose(matrix: number[][]): number[][];
  add(a: number[][], b: number[][]): number[][];
  subtract(a: number[][], b: number[][]): number[][];
  init(): Promise<void>;
}

interface WasmStatsModule {
  mean(data: number[]): number;
  median(data: number[]): number;
  std(data: number[]): number;
  variance(data: number[]): number;
  min(data: number[]): number;
  max(data: number[]): number;
  sum(data: number[]): number;
  mode(data: number[]): number | number[];
  product(data: number[]): number;
  init(): Promise<void>;
}

// ============================================================================
// WASM Module State (Lazy Loading)
// ============================================================================

let wasmMatrix: WasmMatrixModule | null = null;
let wasmStats: WasmStatsModule | null = null;
let wasmInitialized = false;
let wasmInitPromise: Promise<void> | null = null;

// ============================================================================
// WASM Initialization (Lazy Loading)
// ============================================================================

/**
 * Ensures WASM modules are initialized before first use.
 * Uses lazy loading pattern - only initializes when actually needed.
 * Thread-safe: multiple concurrent calls will wait for the same promise.
 */
export async function ensureWasmInitialized(): Promise<void> {
  if (wasmInitialized) return;
  if (!wasmInitPromise) {
    wasmInitPromise = initWASM();
  }
  await wasmInitPromise;
}

/** Initializes WASM modules with integrity verification. */
async function initWASM(): Promise<void> {
  if (wasmInitialized) {
    logger.debug('WASM already initialized');
    return;
  }

  try {
    logger.info('Initializing WASM modules...');

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const wasmPath = join(__dirname, '../wasm');

    // Verify WASM integrity if enabled
    if (isIntegrityCheckEnabled()) {
      logger.debug('Verifying WASM module integrity...');
      await verifyWasmIntegrity(join(wasmPath, 'build/release.wasm'), 'wasm/build/release.wasm');
      await verifyWasmIntegrity(join(wasmPath, 'build/debug.wasm'), 'wasm/build/debug.wasm');
      logger.info('WASM integrity verification passed');
    } else {
      logger.warn('WASM integrity verification DISABLED');
    }

    // Load matrix bindings
    const matrixPath = pathToFileURL(join(wasmPath, 'bindings/matrix.cjs')).href;
    logger.debug('Loading matrix bindings', { path: matrixPath });
    const matrixBindings = await import(matrixPath);
    await matrixBindings.init();
    wasmMatrix = matrixBindings;
    logger.debug('Matrix bindings loaded successfully');

    // Load statistics bindings
    const statsPath = pathToFileURL(join(wasmPath, 'bindings/statistics.cjs')).href;
    logger.debug('Loading statistics bindings', { path: statsPath });
    const statsBindings = await import(statsPath);
    await statsBindings.init();
    wasmStats = statsBindings;
    logger.debug('Statistics bindings loaded successfully');

    wasmInitialized = true;
    logger.info('WASM modules initialized successfully');
  } catch (error) {
    wasmInitialized = false;
    wasmMatrix = null;
    wasmStats = null;
    logger.warn('WASM initialization failed, will use mathjs fallback', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

const getMatrixSize = (m: number[][]): number => m.length;
const getArrayLength = (arr: number[]): number => arr.length;
const getBinaryMatrixSize = (a: number[][], b: number[][]): number => Math.min(a.length, b.length);
const isSquareMatrix = (m: number[][]): boolean => m.length > 0 && m.length === m[0].length;
const areBothSquare = (a: number[][], b: number[][]): boolean => isSquareMatrix(a) && isSquareMatrix(b);

// ============================================================================
// Matrix Operations
// ============================================================================

/** Matrix multiply with auto WASM/mathjs routing. */
export async function matrixMultiply(a: number[][], b: number[][]): Promise<number[][]> {
  await ensureWasmInitialized();
  const config: BinaryOperationConfig<number[][], number[][], number[][]> = {
    name: 'matrix multiply',
    threshold: THRESHOLDS.matrix_multiply,
    getSize: getBinaryMatrixSize,
    wasmFn: (x, y) => wasmMatrix!.multiply(x, y),
    mathjsFn: (x, y) => math.multiply(x, y) as number[][],
    extraCheck: areBothSquare,
  };
  return executeBinaryOp(config, a, b, wasmInitialized && wasmMatrix !== null);
}

/** Matrix determinant with auto WASM/mathjs routing. */
export async function matrixDeterminant(matrix: number[][]): Promise<number> {
  await ensureWasmInitialized();
  const config: UnaryOperationConfig<number[][], number> = {
    name: 'matrix determinant',
    threshold: THRESHOLDS.matrix_det,
    getSize: getMatrixSize,
    wasmFn: (m) => wasmMatrix!.det(m),
    mathjsFn: (m) => math.det(m) as number,
    extraCheck: isSquareMatrix,
  };
  return executeUnaryOp(config, matrix, wasmInitialized && wasmMatrix !== null);
}

/** Matrix transpose with auto WASM/mathjs routing. */
export async function matrixTranspose(matrix: number[][]): Promise<number[][]> {
  await ensureWasmInitialized();
  const config: UnaryOperationConfig<number[][], number[][]> = {
    name: 'matrix transpose',
    threshold: THRESHOLDS.matrix_transpose,
    getSize: getMatrixSize,
    wasmFn: (m) => wasmMatrix!.transpose(m),
    mathjsFn: (m) => math.transpose(m) as number[][],
  };
  return executeUnaryOp(config, matrix, wasmInitialized && wasmMatrix !== null);
}

/** Matrix add with auto WASM/mathjs routing. */
export async function matrixAdd(a: number[][], b: number[][]): Promise<number[][]> {
  await ensureWasmInitialized();
  const config: BinaryOperationConfig<number[][], number[][], number[][]> = {
    name: 'matrix add',
    threshold: THRESHOLDS.matrix_transpose,
    getSize: getBinaryMatrixSize,
    wasmFn: (x, y) => wasmMatrix!.add(x, y),
    mathjsFn: (x, y) => math.add(x, y) as number[][],
  };
  return executeBinaryOp(config, a, b, wasmInitialized && wasmMatrix !== null);
}

/** Matrix subtract with auto WASM/mathjs routing. */
export async function matrixSubtract(a: number[][], b: number[][]): Promise<number[][]> {
  await ensureWasmInitialized();
  const config: BinaryOperationConfig<number[][], number[][], number[][]> = {
    name: 'matrix subtract',
    threshold: THRESHOLDS.matrix_transpose,
    getSize: getBinaryMatrixSize,
    wasmFn: (x, y) => wasmMatrix!.subtract(x, y),
    mathjsFn: (x, y) => math.subtract(x, y) as number[][],
  };
  return executeBinaryOp(config, a, b, wasmInitialized && wasmMatrix !== null);
}

// ============================================================================
// Statistics Operations
// ============================================================================

/** Statistical mean with auto WASM/mathjs routing. */
export async function statsMean(data: number[]): Promise<number> {
  await ensureWasmInitialized();
  const config: UnaryOperationConfig<number[], number> = {
    name: 'stats mean',
    threshold: THRESHOLDS.statistics,
    getSize: getArrayLength,
    wasmFn: (d) => wasmStats!.mean(d),
    mathjsFn: (d) => math.mean(d) as number,
  };
  return executeUnaryOp(config, data, wasmInitialized && wasmStats !== null);
}

/** Statistical median with auto WASM/mathjs routing. */
export async function statsMedian(data: number[]): Promise<number> {
  await ensureWasmInitialized();
  const config: UnaryOperationConfig<number[], number> = {
    name: 'stats median',
    threshold: THRESHOLDS.median,
    getSize: getArrayLength,
    wasmFn: (d) => wasmStats!.median(d),
    mathjsFn: (d) => math.median(d) as number,
  };
  return executeUnaryOp(config, data, wasmInitialized && wasmStats !== null);
}

/** Statistical standard deviation with auto WASM/mathjs routing. */
export async function statsStd(data: number[]): Promise<number> {
  await ensureWasmInitialized();
  const config: UnaryOperationConfig<number[], number> = {
    name: 'stats std',
    threshold: THRESHOLDS.statistics,
    getSize: getArrayLength,
    wasmFn: (d) => wasmStats!.std(d),
    mathjsFn: (d) => {
      const result = math.std(data);
      return typeof result === 'number' ? result : Number(result);
    },
  };
  return executeUnaryOp(config, data, wasmInitialized && wasmStats !== null);
}

/** Statistical variance with auto WASM/mathjs routing. */
export async function statsVariance(data: number[]): Promise<number> {
  await ensureWasmInitialized();
  const config: UnaryOperationConfig<number[], number> = {
    name: 'stats variance',
    threshold: THRESHOLDS.statistics,
    getSize: getArrayLength,
    wasmFn: (d) => wasmStats!.variance(d),
    mathjsFn: (d) => {
      const result = math.variance(data);
      return typeof result === 'number' ? result : Number(result);
    },
  };
  return executeUnaryOp(config, data, wasmInitialized && wasmStats !== null);
}

/** Statistical minimum with auto WASM/mathjs routing. */
export async function statsMin(data: number[]): Promise<number> {
  await ensureWasmInitialized();
  const config: UnaryOperationConfig<number[], number> = {
    name: 'stats min',
    threshold: THRESHOLDS.statistics,
    getSize: getArrayLength,
    wasmFn: (d) => wasmStats!.min(d),
    mathjsFn: (d) => math.min(d) as number,
  };
  return executeUnaryOp(config, data, wasmInitialized && wasmStats !== null);
}

/** Statistical maximum with auto WASM/mathjs routing. */
export async function statsMax(data: number[]): Promise<number> {
  await ensureWasmInitialized();
  const config: UnaryOperationConfig<number[], number> = {
    name: 'stats max',
    threshold: THRESHOLDS.statistics,
    getSize: getArrayLength,
    wasmFn: (d) => wasmStats!.max(d),
    mathjsFn: (d) => math.max(d) as number,
  };
  return executeUnaryOp(config, data, wasmInitialized && wasmStats !== null);
}

/** Statistical sum with auto WASM/mathjs routing. */
export async function statsSum(data: number[]): Promise<number> {
  await ensureWasmInitialized();
  const config: UnaryOperationConfig<number[], number> = {
    name: 'stats sum',
    threshold: THRESHOLDS.statistics,
    getSize: getArrayLength,
    wasmFn: (d) => wasmStats!.sum(d),
    mathjsFn: (d) => math.sum(d) as number,
  };
  return executeUnaryOp(config, data, wasmInitialized && wasmStats !== null);
}

/** Statistical mode with auto WASM/mathjs routing. */
export async function statsMode(data: number[]): Promise<number | number[]> {
  await ensureWasmInitialized();
  const config: UnaryOperationConfig<number[], number | number[]> = {
    name: 'stats mode',
    threshold: THRESHOLDS.statistics,
    getSize: getArrayLength,
    wasmFn: (d) => wasmStats!.mode(d),
    mathjsFn: (d) => math.mode(d),
  };
  return executeUnaryOp(config, data, wasmInitialized && wasmStats !== null);
}

/** Statistical product with auto WASM/mathjs routing. */
export async function statsProduct(data: number[]): Promise<number> {
  await ensureWasmInitialized();
  const config: UnaryOperationConfig<number[], number> = {
    name: 'stats product',
    threshold: THRESHOLDS.statistics,
    getSize: getArrayLength,
    wasmFn: (d) => wasmStats!.product(d),
    mathjsFn: (d) => math.prod(d) as number,
  };
  return executeUnaryOp(config, data, wasmInitialized && wasmStats !== null);
}

// ============================================================================
// Performance Statistics
// ============================================================================

/** Performance statistics interface. */
export interface PerfStats {
  wasmCalls: number;
  mathjsCalls: number;
  totalCalls: number;
  wasmPercentage: string;
  avgWasmTime: string;
  avgMathjsTime: string;
  wasmInitialized: boolean;
}

/** Gets current performance statistics. */
export function getPerfStats(): PerfStats {
  const stats = getExecutorPerfStats();
  return {
    ...stats,
    wasmInitialized,
  };
}

/** Resets performance counters. */
export function resetPerfCounters(): void {
  resetExecutorPerfCounters();
}

// Export initialization status
export { wasmInitialized };

// Note: WASM is lazily initialized on first operation via ensureWasmInitialized()
// For explicit eager initialization, call: ensureWasmInitialized()
