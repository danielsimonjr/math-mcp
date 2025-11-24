/**
 * @file wasm-wrapper.ts
 * @description WASM wrapper with automatic fallback to mathjs
 *
 * This module provides a transparent layer that automatically routes operations
 * to either WASM (for large inputs) or mathjs (for small inputs or when WASM is unavailable).
 *
 * **Architecture:**
 * - Threshold-based routing: Operations above certain sizes use WASM for performance
 * - Graceful fallback: If WASM fails or is unavailable, automatically uses mathjs
 * - Performance tracking: Monitors WASM vs mathjs usage and timing
 *
 * **Performance Benefits:**
 * - Matrix operations: Up to 17x faster for large matrices
 * - Statistical operations: Up to 42x faster for large datasets
 * - Zero overhead: Small operations use mathjs directly
 *
 * @module wasm-wrapper
 * @since 2.0.0
 */

import * as math from 'mathjs';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';
import { WasmError } from './errors.js';
import { logger } from './utils.js';
import { verifyWasmIntegrity, isIntegrityCheckEnabled } from './wasm-integrity.js';

/**
 * Performance thresholds for WASM usage (in matrix dimensions or array length).
 *
 * These thresholds are determined through benchmarking to balance:
 * - WASM initialization overhead (favors mathjs for small operations)
 * - WASM performance gains (favors WASM for large operations)
 *
 * @constant
 * @type {Readonly<Record<string, number>>}
 */
export const THRESHOLDS = {
  /**
   * Use WASM for matrix multiply when matrices are >= 10x10
   * Benchmark shows ~8x speedup at this size
   * @type {number}
   */
  matrix_multiply: 10,

  /**
   * Use WASM for matrix determinant when matrices are >= 5x5
   * Benchmark shows ~17x speedup at this size
   * @type {number}
   */
  matrix_det: 5,

  /**
   * Use WASM for matrix transpose when matrices are >= 20x20
   * Benchmark shows ~2x speedup at this size
   * @type {number}
   */
  matrix_transpose: 20,

  /**
   * Use WASM for statistics operations when arrays have >= 100 elements
   * Benchmark shows 15-42x speedup at this size
   * @type {number}
   */
  statistics: 100,

  /**
   * Use WASM for median when arrays have >= 50 elements
   * Lower threshold due to sorting overhead in WASM
   * @type {number}
   */
  median: 50,
} as const;

/**
 * WASM module instance for matrix operations.
 * Null if not initialized or initialization failed.
 *
 * @type {any | null}
 */
let wasmMatrix: any = null;

/**
 * WASM module instance for statistics operations.
 * Null if not initialized or initialization failed.
 *
 * @type {any | null}
 */
let wasmStats: any = null;

/**
 * Flag indicating whether WASM modules have been successfully initialized.
 *
 * @type {boolean}
 */
let wasmInitialized = false;

/**
 * Performance counters for monitoring WASM vs mathjs usage.
 *
 * @interface PerfCounters
 */
interface PerfCounters {
  /** Number of operations routed to WASM */
  wasmCalls: number;
  /** Number of operations routed to mathjs */
  mathjsCalls: number;
  /** Total time spent in WASM operations (ms) */
  wasmTime: number;
  /** Total time spent in mathjs operations (ms) */
  mathjsTime: number;
}

/**
 * Global performance counters.
 *
 * @type {PerfCounters}
 */
const perfCounters: PerfCounters = {
  wasmCalls: 0,
  mathjsCalls: 0,
  wasmTime: 0,
  mathjsTime: 0,
};

/**
 * Whether performance tracking is enabled.
 * Can be disabled via DISABLE_PERF_TRACKING environment variable for production.
 *
 * @constant
 * @type {boolean}
 */
const PERF_TRACKING_ENABLED = process.env.DISABLE_PERF_TRACKING !== 'true';

/**
 * Records performance metrics for an operation.
 *
 * @param {'wasm' | 'mathjs'} type - Which implementation was used
 * @param {number} duration - Duration in milliseconds
 *
 * @example
 * ```typescript
 * const start = performance.now();
 * const result = await wasmMatrix.multiply(a, b);
 * recordPerf('wasm', performance.now() - start);
 * ```
 */
function recordPerf(type: 'wasm' | 'mathjs', duration: number): void {
  if (!PERF_TRACKING_ENABLED) return;

  if (type === 'wasm') {
    perfCounters.wasmCalls++;
    perfCounters.wasmTime += duration;
  } else {
    perfCounters.mathjsCalls++;
    perfCounters.mathjsTime += duration;
  }
}

/**
 * Initializes WASM modules for matrix and statistics operations.
 *
 * This function:
 * 1. Locates the WASM bindings in the wasm folder
 * 2. Dynamically imports matrix and statistics bindings
 * 3. Calls init() on each binding to load the WASM module
 * 4. Sets wasmInitialized flag on success
 *
 * If initialization fails, logs error and sets wasmInitialized = false.
 * The wrapper will automatically fall back to mathjs for all operations.
 *
 * @returns {Promise<void>} Resolves when initialization completes (success or failure)
 *
 * @example
 * ```typescript
 * await initWASM();
 * if (wasmInitialized) {
 *   console.log('WASM ready for use');
 * }
 * ```
 */
async function initWASM(): Promise<void> {
  if (wasmInitialized) {
    logger.debug('WASM already initialized');
    return;
  }

  try {
    logger.info('Initializing WASM modules...');

    // Get the directory of this module
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const wasmPath = join(__dirname, '../wasm');
    const projectRoot = join(__dirname, '..');

    // Verify WASM integrity before loading (if enabled)
    if (isIntegrityCheckEnabled()) {
      logger.debug('Verifying WASM module integrity...');

      const releaseWasmPath = join(wasmPath, 'build/release.wasm');
      await verifyWasmIntegrity(releaseWasmPath, 'wasm/build/release.wasm');

      const debugWasmPath = join(wasmPath, 'build/debug.wasm');
      await verifyWasmIntegrity(debugWasmPath, 'wasm/build/debug.wasm');

      logger.info('WASM integrity verification passed');
    } else {
      logger.warn('WASM integrity verification DISABLED');
    }

    // Import matrix bindings (convert to file:// URL for ESM)
    const matrixPath = pathToFileURL(join(wasmPath, 'bindings/matrix.cjs')).href;
    logger.debug('Loading matrix bindings', { path: matrixPath });

    const matrixBindings = await import(matrixPath);
    await matrixBindings.init();
    wasmMatrix = matrixBindings;
    logger.debug('Matrix bindings loaded successfully');

    // Import statistics bindings (convert to file:// URL for ESM)
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

/**
 * Gets the size (number of rows) of a matrix.
 *
 * @param {number[][]} matrix - The matrix to measure
 * @returns {number} The number of rows in the matrix
 *
 * @example
 * ```typescript
 * getMatrixSize([[1,2],[3,4]]); // Returns: 2
 * ```
 */
function getMatrixSize(matrix: number[][]): number {
  return matrix.length;
}

/**
 * Checks if a matrix is square (rows === columns).
 *
 * @param {number[][]} matrix - The matrix to check
 * @returns {boolean} True if the matrix is square
 *
 * @example
 * ```typescript
 * isSquareMatrix([[1,2],[3,4]]);    // Returns: true
 * isSquareMatrix([[1,2,3],[4,5,6]]); // Returns: false
 * ```
 */
function isSquareMatrix(matrix: number[][]): boolean {
  return matrix.length > 0 && matrix.length === matrix[0].length;
}

/**
 * Multiplies two matrices with automatic WASM/mathjs routing.
 *
 * **Routing logic:**
 * - If WASM is initialized AND both matrices are square AND size >= 10x10: use WASM
 * - Otherwise: use mathjs
 * - If WASM fails: fall back to mathjs
 *
 * @param {number[][]} a - First matrix (m×n)
 * @param {number[][]} b - Second matrix (n×p)
 * @returns {Promise<number[][]>} Result matrix (m×p)
 *
 * @example
 * ```typescript
 * const a = [[1,2],[3,4]];
 * const b = [[5,6],[7,8]];
 * const result = await matrixMultiply(a, b);
 * // Returns: [[19,22],[43,50]]
 * ```
 */
export async function matrixMultiply(a: number[][], b: number[][]): Promise<number[][]> {
  const size = Math.min(a.length, b.length);
  const useWASM =
    wasmInitialized &&
    size >= THRESHOLDS.matrix_multiply &&
    isSquareMatrix(a) &&
    isSquareMatrix(b);

  const start = PERF_TRACKING_ENABLED ? performance.now() : 0;

  try {
    if (useWASM && wasmMatrix) {
      logger.debug('Using WASM for matrix multiply', {
        size: `${a.length}×${a[0].length}`,
      });

      const result = wasmMatrix.multiply(a, b);
      if (PERF_TRACKING_ENABLED) {
        recordPerf('wasm', performance.now() - start);
      }
      return result;
    }
  } catch (error) {
    logger.error('WASM matrix multiply failed, falling back to mathjs', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Fallback to mathjs
  logger.debug('Using mathjs for matrix multiply', {
    size: `${a.length}×${a[0].length}`,
  });

  const result = math.multiply(a, b) as number[][];
  if (PERF_TRACKING_ENABLED) {
    recordPerf('mathjs', performance.now() - start);
  }
  return result;
}

/**
 * Calculates matrix determinant with automatic WASM/mathjs routing.
 *
 * **Routing logic:**
 * - If WASM is initialized AND matrix is square AND size >= 5x5: use WASM
 * - Otherwise: use mathjs
 * - If WASM fails: fall back to mathjs
 *
 * @param {number[][]} matrix - Square matrix
 * @returns {Promise<number>} The determinant value
 *
 * @example
 * ```typescript
 * const result = await matrixDeterminant([[1,2],[3,4]]);
 * // Returns: -2
 * ```
 */
export async function matrixDeterminant(matrix: number[][]): Promise<number> {
  const size = getMatrixSize(matrix);
  const useWASM = wasmInitialized && size >= THRESHOLDS.matrix_det && isSquareMatrix(matrix);

  const start = PERF_TRACKING_ENABLED ? performance.now() : 0;

  try {
    if (useWASM && wasmMatrix) {
      logger.debug('Using WASM for matrix determinant', { size: `${size}×${size}` });

      const result = wasmMatrix.det(matrix);
      if (PERF_TRACKING_ENABLED) {
        recordPerf('wasm', performance.now() - start);
      }
      return result;
    }
  } catch (error) {
    logger.error('WASM determinant failed, falling back to mathjs', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Fallback to mathjs
  logger.debug('Using mathjs for matrix determinant', { size: `${size}×${size}` });

  const result = math.det(matrix) as number;
  if (PERF_TRACKING_ENABLED) {
    recordPerf('mathjs', performance.now() - start);
  }
  return result;
}

/**
 * Transposes a matrix with automatic WASM/mathjs routing.
 *
 * **Routing logic:**
 * - If WASM is initialized AND size >= 20x20: use WASM
 * - Otherwise: use mathjs
 * - If WASM fails: fall back to mathjs
 *
 * @param {number[][]} matrix - Input matrix (m×n)
 * @returns {Promise<number[][]>} Transposed matrix (n×m)
 *
 * @example
 * ```typescript
 * const result = await matrixTranspose([[1,2,3],[4,5,6]]);
 * // Returns: [[1,4],[2,5],[3,6]]
 * ```
 */
export async function matrixTranspose(matrix: number[][]): Promise<number[][]> {
  const size = getMatrixSize(matrix);
  const useWASM = wasmInitialized && size >= THRESHOLDS.matrix_transpose;

  const start = PERF_TRACKING_ENABLED ? performance.now() : 0;

  try {
    if (useWASM && wasmMatrix) {
      logger.debug('Using WASM for matrix transpose', {
        size: `${matrix.length}×${matrix[0].length}`,
      });

      const result = wasmMatrix.transpose(matrix);
      if (PERF_TRACKING_ENABLED) {
        recordPerf('wasm', performance.now() - start);
      }
      return result;
    }
  } catch (error) {
    logger.error('WASM transpose failed, falling back to mathjs', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Fallback to mathjs
  logger.debug('Using mathjs for matrix transpose', {
    size: `${matrix.length}×${matrix[0].length}`,
  });

  const result = math.transpose(matrix) as number[][];
  if (PERF_TRACKING_ENABLED) {
    recordPerf('mathjs', performance.now() - start);
  }
  return result;
}

/**
 * Adds two matrices element-wise with automatic WASM/mathjs routing.
 *
 * **Routing logic:**
 * - If WASM is initialized AND size >= 20x20: use WASM
 * - Otherwise: use mathjs
 * - If WASM fails: fall back to mathjs
 *
 * @param {number[][]} a - First matrix
 * @param {number[][]} b - Second matrix (must have same dimensions as a)
 * @returns {Promise<number[][]>} Result matrix
 *
 * @example
 * ```typescript
 * const result = await matrixAdd([[1,2],[3,4]], [[5,6],[7,8]]);
 * // Returns: [[6,8],[10,12]]
 * ```
 */
export async function matrixAdd(a: number[][], b: number[][]): Promise<number[][]> {
  const size = Math.min(a.length, b.length);
  const useWASM = wasmInitialized && size >= THRESHOLDS.matrix_transpose;

  const start = PERF_TRACKING_ENABLED ? performance.now() : 0;

  try {
    if (useWASM && wasmMatrix) {
      logger.debug('Using WASM for matrix add', {
        size: `${a.length}×${a[0].length}`,
      });

      const result = wasmMatrix.add(a, b);
      if (PERF_TRACKING_ENABLED) {
        recordPerf('wasm', performance.now() - start);
      }
      return result;
    }
  } catch (error) {
    logger.error('WASM matrix add failed, falling back to mathjs', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Fallback to mathjs
  logger.debug('Using mathjs for matrix add', {
    size: `${a.length}×${a[0].length}`,
  });

  const result = math.add(a, b) as number[][];
  if (PERF_TRACKING_ENABLED) {
    recordPerf('mathjs', performance.now() - start);
  }
  return result;
}

/**
 * Subtracts two matrices element-wise with automatic WASM/mathjs routing.
 *
 * **Routing logic:**
 * - If WASM is initialized AND size >= 20x20: use WASM
 * - Otherwise: use mathjs
 * - If WASM fails: fall back to mathjs
 *
 * @param {number[][]} a - First matrix
 * @param {number[][]} b - Second matrix (must have same dimensions as a)
 * @returns {Promise<number[][]>} Result matrix
 *
 * @example
 * ```typescript
 * const result = await matrixSubtract([[5,6],[7,8]], [[1,2],[3,4]]);
 * // Returns: [[4,4],[4,4]]
 * ```
 */
export async function matrixSubtract(a: number[][], b: number[][]): Promise<number[][]> {
  const size = Math.min(a.length, b.length);
  const useWASM = wasmInitialized && size >= THRESHOLDS.matrix_transpose;

  const start = PERF_TRACKING_ENABLED ? performance.now() : 0;

  try {
    if (useWASM && wasmMatrix) {
      logger.debug('Using WASM for matrix subtract', {
        size: `${a.length}×${a[0].length}`,
      });

      const result = wasmMatrix.subtract(a, b);
      if (PERF_TRACKING_ENABLED) {
        recordPerf('wasm', performance.now() - start);
      }
      return result;
    }
  } catch (error) {
    logger.error('WASM matrix subtract failed, falling back to mathjs', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Fallback to mathjs
  logger.debug('Using mathjs for matrix subtract', {
    size: `${a.length}×${a[0].length}`,
  });

  const result = math.subtract(a, b) as number[][];
  if (PERF_TRACKING_ENABLED) {
    recordPerf('mathjs', performance.now() - start);
  }
  return result;
}

/**
 * Calculates the mean (average) of an array with automatic WASM/mathjs routing.
 *
 * **Routing logic:**
 * - If WASM is initialized AND array length >= 100: use WASM
 * - Otherwise: use mathjs
 * - If WASM fails: fall back to mathjs
 *
 * @param {number[]} data - Array of numbers
 * @returns {Promise<number>} The mean value
 *
 * @example
 * ```typescript
 * const result = await statsMean([1,2,3,4,5]);
 * // Returns: 3
 * ```
 */
export async function statsMean(data: number[]): Promise<number> {
  const useWASM = wasmInitialized && data.length >= THRESHOLDS.statistics;
  const start = PERF_TRACKING_ENABLED ? performance.now() : 0;

  try {
    if (useWASM && wasmStats) {
      logger.debug('Using WASM for stats mean', { length: data.length });

      const result = wasmStats.mean(data);
      if (PERF_TRACKING_ENABLED) {
        recordPerf('wasm', performance.now() - start);
      }
      return result;
    }
  } catch (error) {
    logger.error('WASM mean failed, falling back to mathjs', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Fallback to mathjs
  logger.debug('Using mathjs for stats mean', { length: data.length });

  const result = math.mean(data) as number;
  if (PERF_TRACKING_ENABLED) {
    recordPerf('mathjs', performance.now() - start);
  }
  return result;
}

/**
 * Calculates the median of an array with automatic WASM/mathjs routing.
 *
 * **Routing logic:**
 * - If WASM is initialized AND array length >= 50: use WASM
 * - Otherwise: use mathjs
 * - If WASM fails: fall back to mathjs
 *
 * Note: Lower threshold (50 vs 100) due to sorting overhead in WASM.
 *
 * @param {number[]} data - Array of numbers
 * @returns {Promise<number>} The median value
 *
 * @example
 * ```typescript
 * const result = await statsMedian([1,2,3,4,5]);
 * // Returns: 3
 * ```
 */
export async function statsMedian(data: number[]): Promise<number> {
  const useWASM = wasmInitialized && data.length >= THRESHOLDS.median;
  const start = PERF_TRACKING_ENABLED ? performance.now() : 0;

  try {
    if (useWASM && wasmStats) {
      logger.debug('Using WASM for stats median', { length: data.length });

      const result = wasmStats.median(data);
      if (PERF_TRACKING_ENABLED) {
        recordPerf('wasm', performance.now() - start);
      }
      return result;
    }
  } catch (error) {
    logger.error('WASM median failed, falling back to mathjs', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Fallback to mathjs
  logger.debug('Using mathjs for stats median', { length: data.length });

  const result = math.median(data) as number;
  if (PERF_TRACKING_ENABLED) {
    recordPerf('mathjs', performance.now() - start);
  }
  return result;
}

/**
 * Calculates standard deviation with automatic WASM/mathjs routing.
 *
 * @param {number[]} data - Array of numbers
 * @returns {Promise<number>} The standard deviation
 *
 * @example
 * ```typescript
 * const result = await statsStd([2,4,4,4,5,5,7,9]);
 * // Returns: ~2
 * ```
 */
export async function statsStd(data: number[]): Promise<number> {
  const useWASM = wasmInitialized && data.length >= THRESHOLDS.statistics;
  const start = PERF_TRACKING_ENABLED ? performance.now() : 0;

  try {
    if (useWASM && wasmStats) {
      logger.debug('Using WASM for stats std', { length: data.length });

      const result = wasmStats.std(data);
      if (PERF_TRACKING_ENABLED) {
        recordPerf('wasm', performance.now() - start);
      }
      return result;
    }
  } catch (error) {
    logger.error('WASM std failed, falling back to mathjs', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Fallback to mathjs
  logger.debug('Using mathjs for stats std', { length: data.length });

  const result = math.std(data);
  if (PERF_TRACKING_ENABLED) {
    recordPerf('mathjs', performance.now() - start);
  }
  return typeof result === 'number' ? result : Number(result);
}

/**
 * Calculates variance with automatic WASM/mathjs routing.
 *
 * @param {number[]} data - Array of numbers
 * @returns {Promise<number>} The variance
 *
 * @example
 * ```typescript
 * const result = await statsVariance([1,2,3,4,5]);
 * // Returns: 2.5 (sample variance)
 * ```
 */
export async function statsVariance(data: number[]): Promise<number> {
  const useWASM = wasmInitialized && data.length >= THRESHOLDS.statistics;
  const start = PERF_TRACKING_ENABLED ? performance.now() : 0;

  try {
    if (useWASM && wasmStats) {
      logger.debug('Using WASM for stats variance', { length: data.length });

      const result = wasmStats.variance(data);
      if (PERF_TRACKING_ENABLED) {
        recordPerf('wasm', performance.now() - start);
      }
      return result;
    }
  } catch (error) {
    logger.error('WASM variance failed, falling back to mathjs', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Fallback to mathjs
  logger.debug('Using mathjs for stats variance', { length: data.length });

  const result = math.variance(data);
  if (PERF_TRACKING_ENABLED) {
    recordPerf('mathjs', performance.now() - start);
  }
  return typeof result === 'number' ? result : Number(result);
}

/**
 * Finds minimum value with automatic WASM/mathjs routing.
 *
 * @param {number[]} data - Array of numbers
 * @returns {Promise<number>} The minimum value
 *
 * @example
 * ```typescript
 * const result = await statsMin([3,1,4,1,5]);
 * // Returns: 1
 * ```
 */
export async function statsMin(data: number[]): Promise<number> {
  const useWASM = wasmInitialized && data.length >= THRESHOLDS.statistics;
  const start = PERF_TRACKING_ENABLED ? performance.now() : 0;

  try {
    if (useWASM && wasmStats) {
      logger.debug('Using WASM for stats min', { length: data.length });

      const result = wasmStats.min(data);
      if (PERF_TRACKING_ENABLED) {
        recordPerf('wasm', performance.now() - start);
      }
      return result;
    }
  } catch (error) {
    logger.error('WASM min failed, falling back to mathjs', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Fallback to mathjs
  logger.debug('Using mathjs for stats min', { length: data.length });

  const result = math.min(data) as number;
  if (PERF_TRACKING_ENABLED) {
    recordPerf('mathjs', performance.now() - start);
  }
  return result;
}

/**
 * Finds maximum value with automatic WASM/mathjs routing.
 *
 * @param {number[]} data - Array of numbers
 * @returns {Promise<number>} The maximum value
 *
 * @example
 * ```typescript
 * const result = await statsMax([3,1,4,1,5]);
 * // Returns: 5
 * ```
 */
export async function statsMax(data: number[]): Promise<number> {
  const useWASM = wasmInitialized && data.length >= THRESHOLDS.statistics;
  const start = PERF_TRACKING_ENABLED ? performance.now() : 0;

  try {
    if (useWASM && wasmStats) {
      logger.debug('Using WASM for stats max', { length: data.length });

      const result = wasmStats.max(data);
      if (PERF_TRACKING_ENABLED) {
        recordPerf('wasm', performance.now() - start);
      }
      return result;
    }
  } catch (error) {
    logger.error('WASM max failed, falling back to mathjs', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Fallback to mathjs
  logger.debug('Using mathjs for stats max', { length: data.length });

  const result = math.max(data) as number;
  if (PERF_TRACKING_ENABLED) {
    recordPerf('mathjs', performance.now() - start);
  }
  return result;
}

/**
 * Calculates sum with automatic WASM/mathjs routing.
 *
 * @param {number[]} data - Array of numbers
 * @returns {Promise<number>} The sum
 *
 * @example
 * ```typescript
 * const result = await statsSum([1,2,3,4,5]);
 * // Returns: 15
 * ```
 */
export async function statsSum(data: number[]): Promise<number> {
  const useWASM = wasmInitialized && data.length >= THRESHOLDS.statistics;
  const start = PERF_TRACKING_ENABLED ? performance.now() : 0;

  try {
    if (useWASM && wasmStats) {
      logger.debug('Using WASM for stats sum', { length: data.length });

      const result = wasmStats.sum(data);
      if (PERF_TRACKING_ENABLED) {
        recordPerf('wasm', performance.now() - start);
      }
      return result;
    }
  } catch (error) {
    logger.error('WASM sum failed, falling back to mathjs', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Fallback to mathjs
  logger.debug('Using mathjs for stats sum', { length: data.length });

  const result = math.sum(data) as number;
  if (PERF_TRACKING_ENABLED) {
    recordPerf('mathjs', performance.now() - start);
  }
  return result;
}

/**
 * Finds mode (most frequent value) with automatic WASM/mathjs routing.
 *
 * @param {number[]} data - Array of numbers
 * @returns {Promise<number | number[]>} The mode value(s)
 *
 * @example
 * ```typescript
 * const result = await statsMode([1,2,2,3,4,4,4,5]);
 * // Returns: 4
 * ```
 */
export async function statsMode(data: number[]): Promise<number | number[]> {
  const useWASM = wasmInitialized && data.length >= THRESHOLDS.statistics;
  const start = PERF_TRACKING_ENABLED ? performance.now() : 0;

  try {
    if (useWASM && wasmStats) {
      logger.debug('Using WASM for stats mode', { length: data.length });

      const result = wasmStats.mode(data);
      if (PERF_TRACKING_ENABLED) {
        recordPerf('wasm', performance.now() - start);
      }
      return result;
    }
  } catch (error) {
    logger.error('WASM mode failed, falling back to mathjs', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Fallback to mathjs
  logger.debug('Using mathjs for stats mode', { length: data.length });

  const result = math.mode(data);
  if (PERF_TRACKING_ENABLED) {
    recordPerf('mathjs', performance.now() - start);
  }
  return result;
}

/**
 * Calculates product with automatic WASM/mathjs routing.
 *
 * @param {number[]} data - Array of numbers
 * @returns {Promise<number>} The product of all numbers
 *
 * @example
 * ```typescript
 * const result = await statsProduct([2,3,4]);
 * // Returns: 24
 * ```
 */
export async function statsProduct(data: number[]): Promise<number> {
  const useWASM = wasmInitialized && data.length >= THRESHOLDS.statistics;
  const start = PERF_TRACKING_ENABLED ? performance.now() : 0;

  try {
    if (useWASM && wasmStats) {
      logger.debug('Using WASM for stats product', { length: data.length });

      const result = wasmStats.product(data);
      if (PERF_TRACKING_ENABLED) {
        recordPerf('wasm', performance.now() - start);
      }
      return result;
    }
  } catch (error) {
    logger.error('WASM product failed, falling back to mathjs', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Fallback to mathjs
  logger.debug('Using mathjs for stats product', { length: data.length });

  const result = math.prod(data) as number;
  if (PERF_TRACKING_ENABLED) {
    recordPerf('mathjs', performance.now() - start);
  }
  return result;
}

/**
 * Performance statistics for monitoring WASM vs mathjs usage.
 *
 * @interface PerfStats
 */
export interface PerfStats {
  /** Number of operations routed to WASM */
  wasmCalls: number;
  /** Number of operations routed to mathjs */
  mathjsCalls: number;
  /** Total number of operations */
  totalCalls: number;
  /** Percentage of operations using WASM */
  wasmPercentage: string;
  /** Average time per WASM operation */
  avgWasmTime: string;
  /** Average time per mathjs operation */
  avgMathjsTime: string;
  /** Whether WASM is initialized */
  wasmInitialized: boolean;
}

/**
 * Gets current performance statistics.
 *
 * Returns metrics about WASM vs mathjs usage including:
 * - Call counts
 * - Average execution times
 * - Percentage breakdown
 *
 * @returns {PerfStats} Performance statistics object
 *
 * @example
 * ```typescript
 * const stats = getPerfStats();
 * console.log(`WASM usage: ${stats.wasmPercentage}`);
 * console.log(`Average WASM time: ${stats.avgWasmTime}`);
 * ```
 */
export function getPerfStats(): PerfStats {
  const totalCalls = perfCounters.wasmCalls + perfCounters.mathjsCalls;
  const wasmPct = totalCalls > 0 ? (perfCounters.wasmCalls / totalCalls) * 100 : 0;
  const avgWasmTime =
    perfCounters.wasmCalls > 0 ? perfCounters.wasmTime / perfCounters.wasmCalls : 0;
  const avgMathjsTime =
    perfCounters.mathjsCalls > 0 ? perfCounters.mathjsTime / perfCounters.mathjsCalls : 0;

  return {
    wasmCalls: perfCounters.wasmCalls,
    mathjsCalls: perfCounters.mathjsCalls,
    totalCalls,
    wasmPercentage: wasmPct.toFixed(1) + '%',
    avgWasmTime: avgWasmTime.toFixed(3) + 'ms',
    avgMathjsTime: avgMathjsTime.toFixed(3) + 'ms',
    wasmInitialized,
  };
}

/**
 * Resets performance counters.
 * Useful for benchmarking or periodic monitoring.
 *
 * @example
 * ```typescript
 * resetPerfCounters();
 * // ... run operations ...
 * const stats = getPerfStats(); // Stats for operations since reset
 * ```
 */
export function resetPerfCounters(): void {
  perfCounters.wasmCalls = 0;
  perfCounters.mathjsCalls = 0;
  perfCounters.wasmTime = 0;
  perfCounters.mathjsTime = 0;
  logger.debug('Performance counters reset');
}

// Initialize WASM on module load
initWASM().catch((err) => {
  logger.error('Failed to initialize WASM', {
    error: err instanceof Error ? err.message : String(err),
  });
});

// Export initialization status
export { wasmInitialized };
