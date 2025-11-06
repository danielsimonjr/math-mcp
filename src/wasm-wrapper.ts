/**
 * @file wasm-wrapper.ts
 * @description WASM wrapper with automatic fallback to mathjs
 *
 * This module provides a transparent layer that automatically uses WASM
 * for large operations and falls back to mathjs for small operations or
 * when WASM is unavailable.
 */

import * as math from 'mathjs';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

// Thresholds for WASM usage (elements/size)
const THRESHOLDS = {
  matrix_multiply: 10,  // Use WASM for matrices >= 10x10
  matrix_det: 5,        // Use WASM for matrices >= 5x5
  matrix_transpose: 20, // Use WASM for matrices >= 20x20
  statistics: 100,      // Use WASM for arrays >= 100 elements
  median: 50,           // Use WASM for arrays >= 50 elements (due to sorting overhead)
};

// WASM module instances
let wasmMatrix: any = null;
let wasmStats: any = null;
let wasmInitialized = false;

// Performance counters
const perfCounters = {
  wasmCalls: 0,
  mathjsCalls: 0,
  wasmTime: 0,
  mathjsTime: 0,
};

/**
 * Initialize WASM modules
 */
async function initWASM() {
  if (wasmInitialized) return;

  try {
    // Dynamically import WASM bindings from wasm folder
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const wasmPath = join(__dirname, '../wasm');

    // Import matrix bindings (convert to file:// URL for ESM)
    const matrixPath = pathToFileURL(join(wasmPath, 'bindings/matrix.cjs')).href;
    const matrixBindings = await import(matrixPath);
    await matrixBindings.init();
    wasmMatrix = matrixBindings;

    // Import statistics bindings (convert to file:// URL for ESM)
    const statsPath = pathToFileURL(join(wasmPath, 'bindings/statistics.cjs')).href;
    const statsBindings = await import(statsPath);
    await statsBindings.init();
    wasmStats = statsBindings;

    wasmInitialized = true;
    console.error('[WASM] Modules initialized successfully');
  } catch (error) {
    console.error('[WASM] Initialization failed, will use mathjs fallback:', error);
    wasmInitialized = false;
  }
}

/**
 * Get matrix size from array
 */
function getMatrixSize(matrix: number[][]): number {
  return matrix.length;
}

/**
 * Check if matrix is square
 */
function isSquareMatrix(matrix: number[][]): boolean {
  return matrix.length > 0 && matrix.length === matrix[0].length;
}

/**
 * Matrix multiply with WASM fallback
 */
export async function matrixMultiply(a: number[][], b: number[][]): Promise<number[][]> {
  const size = Math.min(a.length, b.length);
  const useWASM = wasmInitialized &&
                  size >= THRESHOLDS.matrix_multiply &&
                  isSquareMatrix(a) &&
                  isSquareMatrix(b);

  const start = performance.now();

  try {
    if (useWASM && wasmMatrix) {
      const result = wasmMatrix.multiply(a, b);
      perfCounters.wasmCalls++;
      perfCounters.wasmTime += performance.now() - start;
      return result;
    }
  } catch (error) {
    console.error('[WASM] Matrix multiply failed, falling back to mathjs:', error);
  }

  // Fallback to mathjs
  const result = math.multiply(a, b) as number[][];
  perfCounters.mathjsCalls++;
  perfCounters.mathjsTime += performance.now() - start;
  return result;
}

/**
 * Matrix determinant with WASM fallback
 */
export async function matrixDeterminant(matrix: number[][]): Promise<number> {
  const size = getMatrixSize(matrix);
  const useWASM = wasmInitialized &&
                  size >= THRESHOLDS.matrix_det &&
                  isSquareMatrix(matrix);

  const start = performance.now();

  try {
    if (useWASM && wasmMatrix) {
      const result = wasmMatrix.det(matrix);
      perfCounters.wasmCalls++;
      perfCounters.wasmTime += performance.now() - start;
      return result;
    }
  } catch (error) {
    console.error('[WASM] Determinant failed, falling back to mathjs:', error);
  }

  // Fallback to mathjs
  const result = math.det(matrix) as number;
  perfCounters.mathjsCalls++;
  perfCounters.mathjsTime += performance.now() - start;
  return result;
}

/**
 * Matrix transpose with WASM fallback
 */
export async function matrixTranspose(matrix: number[][]): Promise<number[][]> {
  const size = getMatrixSize(matrix);
  const useWASM = wasmInitialized && size >= THRESHOLDS.matrix_transpose;

  const start = performance.now();

  try {
    if (useWASM && wasmMatrix) {
      const result = wasmMatrix.transpose(matrix);
      perfCounters.wasmCalls++;
      perfCounters.wasmTime += performance.now() - start;
      return result;
    }
  } catch (error) {
    console.error('[WASM] Transpose failed, falling back to mathjs:', error);
  }

  // Fallback to mathjs
  const result = math.transpose(matrix) as number[][];
  perfCounters.mathjsCalls++;
  perfCounters.mathjsTime += performance.now() - start;
  return result;
}

/**
 * Matrix add with WASM fallback
 */
export async function matrixAdd(a: number[][], b: number[][]): Promise<number[][]> {
  const size = Math.min(a.length, b.length);
  const useWASM = wasmInitialized && size >= THRESHOLDS.matrix_transpose;

  const start = performance.now();

  try {
    if (useWASM && wasmMatrix) {
      const result = wasmMatrix.add(a, b);
      perfCounters.wasmCalls++;
      perfCounters.wasmTime += performance.now() - start;
      return result;
    }
  } catch (error) {
    console.error('[WASM] Matrix add failed, falling back to mathjs:', error);
  }

  // Fallback to mathjs
  const result = math.add(a, b) as number[][];
  perfCounters.mathjsCalls++;
  perfCounters.mathjsTime += performance.now() - start;
  return result;
}

/**
 * Matrix subtract with WASM fallback
 */
export async function matrixSubtract(a: number[][], b: number[][]): Promise<number[][]> {
  const size = Math.min(a.length, b.length);
  const useWASM = wasmInitialized && size >= THRESHOLDS.matrix_transpose;

  const start = performance.now();

  try {
    if (useWASM && wasmMatrix) {
      const result = wasmMatrix.subtract(a, b);
      perfCounters.wasmCalls++;
      perfCounters.wasmTime += performance.now() - start;
      return result;
    }
  } catch (error) {
    console.error('[WASM] Matrix subtract failed, falling back to mathjs:', error);
  }

  // Fallback to mathjs
  const result = math.subtract(a, b) as number[][];
  perfCounters.mathjsCalls++;
  perfCounters.mathjsTime += performance.now() - start;
  return result;
}

/**
 * Statistics mean with WASM fallback
 */
export async function statsMean(data: number[]): Promise<number> {
  const useWASM = wasmInitialized && data.length >= THRESHOLDS.statistics;
  const start = performance.now();

  try {
    if (useWASM && wasmStats) {
      const result = wasmStats.mean(data);
      perfCounters.wasmCalls++;
      perfCounters.wasmTime += performance.now() - start;
      return result;
    }
  } catch (error) {
    console.error('[WASM] Mean failed, falling back to mathjs:', error);
  }

  // Fallback to mathjs
  const result = math.mean(data) as number;
  perfCounters.mathjsCalls++;
  perfCounters.mathjsTime += performance.now() - start;
  return result;
}

/**
 * Statistics median with WASM fallback
 */
export async function statsMedian(data: number[]): Promise<number> {
  const useWASM = wasmInitialized && data.length >= THRESHOLDS.median;
  const start = performance.now();

  try {
    if (useWASM && wasmStats) {
      const result = wasmStats.median(data);
      perfCounters.wasmCalls++;
      perfCounters.wasmTime += performance.now() - start;
      return result;
    }
  } catch (error) {
    console.error('[WASM] Median failed, falling back to mathjs:', error);
  }

  // Fallback to mathjs
  const result = math.median(data) as number;
  perfCounters.mathjsCalls++;
  perfCounters.mathjsTime += performance.now() - start;
  return result;
}

/**
 * Statistics std with WASM fallback
 */
export async function statsStd(data: number[]): Promise<number> {
  const useWASM = wasmInitialized && data.length >= THRESHOLDS.statistics;
  const start = performance.now();

  try {
    if (useWASM && wasmStats) {
      const result = wasmStats.std(data);
      perfCounters.wasmCalls++;
      perfCounters.wasmTime += performance.now() - start;
      return result;
    }
  } catch (error) {
    console.error('[WASM] Std failed, falling back to mathjs:', error);
  }

  // Fallback to mathjs
  const result = math.std(data);
  perfCounters.mathjsCalls++;
  perfCounters.mathjsTime += performance.now() - start;
  return typeof result === 'number' ? result : Number(result);
}

/**
 * Statistics variance with WASM fallback
 */
export async function statsVariance(data: number[]): Promise<number> {
  const useWASM = wasmInitialized && data.length >= THRESHOLDS.statistics;
  const start = performance.now();

  try {
    if (useWASM && wasmStats) {
      const result = wasmStats.variance(data);
      perfCounters.wasmCalls++;
      perfCounters.wasmTime += performance.now() - start;
      return result;
    }
  } catch (error) {
    console.error('[WASM] Variance failed, falling back to mathjs:', error);
  }

  // Fallback to mathjs
  const result = math.variance(data);
  perfCounters.mathjsCalls++;
  perfCounters.mathjsTime += performance.now() - start;
  return typeof result === 'number' ? result : Number(result);
}

/**
 * Statistics min with WASM fallback
 */
export async function statsMin(data: number[]): Promise<number> {
  const useWASM = wasmInitialized && data.length >= THRESHOLDS.statistics;
  const start = performance.now();

  try {
    if (useWASM && wasmStats) {
      const result = wasmStats.min(data);
      perfCounters.wasmCalls++;
      perfCounters.wasmTime += performance.now() - start;
      return result;
    }
  } catch (error) {
    console.error('[WASM] Min failed, falling back to mathjs:', error);
  }

  // Fallback to mathjs
  const result = math.min(data) as number;
  perfCounters.mathjsCalls++;
  perfCounters.mathjsTime += performance.now() - start;
  return result;
}

/**
 * Statistics max with WASM fallback
 */
export async function statsMax(data: number[]): Promise<number> {
  const useWASM = wasmInitialized && data.length >= THRESHOLDS.statistics;
  const start = performance.now();

  try {
    if (useWASM && wasmStats) {
      const result = wasmStats.max(data);
      perfCounters.wasmCalls++;
      perfCounters.wasmTime += performance.now() - start;
      return result;
    }
  } catch (error) {
    console.error('[WASM] Max failed, falling back to mathjs:', error);
  }

  // Fallback to mathjs
  const result = math.max(data) as number;
  perfCounters.mathjsCalls++;
  perfCounters.mathjsTime += performance.now() - start;
  return result;
}

/**
 * Statistics sum with WASM fallback
 */
export async function statsSum(data: number[]): Promise<number> {
  const useWASM = wasmInitialized && data.length >= THRESHOLDS.statistics;
  const start = performance.now();

  try {
    if (useWASM && wasmStats) {
      const result = wasmStats.sum(data);
      perfCounters.wasmCalls++;
      perfCounters.wasmTime += performance.now() - start;
      return result;
    }
  } catch (error) {
    console.error('[WASM] Sum failed, falling back to mathjs:', error);
  }

  // Fallback to mathjs
  const result = math.sum(data) as number;
  perfCounters.mathjsCalls++;
  perfCounters.mathjsTime += performance.now() - start;
  return result;
}

/**
 * Statistics mode with WASM fallback
 */
export async function statsMode(data: number[]): Promise<number | number[]> {
  const useWASM = wasmInitialized && data.length >= THRESHOLDS.statistics;
  const start = performance.now();

  try {
    if (useWASM && wasmStats) {
      const result = wasmStats.mode(data);
      perfCounters.wasmCalls++;
      perfCounters.wasmTime += performance.now() - start;
      return result;
    }
  } catch (error) {
    console.error('[WASM] Mode failed, falling back to mathjs:', error);
  }

  // Fallback to mathjs
  const result = math.mode(data);
  perfCounters.mathjsCalls++;
  perfCounters.mathjsTime += performance.now() - start;
  return result;
}

/**
 * Statistics product with WASM fallback
 */
export async function statsProduct(data: number[]): Promise<number> {
  const useWASM = wasmInitialized && data.length >= THRESHOLDS.statistics;
  const start = performance.now();

  try {
    if (useWASM && wasmStats) {
      const result = wasmStats.product(data);
      perfCounters.wasmCalls++;
      perfCounters.wasmTime += performance.now() - start;
      return result;
    }
  } catch (error) {
    console.error('[WASM] Product failed, falling back to mathjs:', error);
  }

  // Fallback to mathjs
  const result = math.prod(data) as number;
  perfCounters.mathjsCalls++;
  perfCounters.mathjsTime += performance.now() - start;
  return result;
}

/**
 * Get performance statistics
 */
export function getPerfStats() {
  const totalCalls = perfCounters.wasmCalls + perfCounters.mathjsCalls;
  const wasmPct = totalCalls > 0 ? (perfCounters.wasmCalls / totalCalls) * 100 : 0;
  const avgWasmTime = perfCounters.wasmCalls > 0 ? perfCounters.wasmTime / perfCounters.wasmCalls : 0;
  const avgMathjsTime = perfCounters.mathjsCalls > 0 ? perfCounters.mathjsTime / perfCounters.mathjsCalls : 0;

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

// Initialize WASM on module load
initWASM().catch(err => {
  console.error('[WASM] Failed to initialize:', err);
});

// Export initialization status
export { wasmInitialized };
