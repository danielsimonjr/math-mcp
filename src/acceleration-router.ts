/**
 * @file acceleration-router.ts
 * @description Unified acceleration router for mathematical operations
 *
 * This module provides intelligent routing of mathematical operations through
 * the optimal acceleration layer based on operation size and type.
 *
 * **Routing Strategy:**
 * ```
 * Small data (< WASM threshold)    → mathjs (no overhead)
 * Medium data (< Worker threshold)  → WASM (single-threaded)
 * Large data (< GPU threshold)      → WebWorkers + WASM (multi-threaded)
 * Very large data (>= GPU threshold)→ WebGPU (massive parallelism)
 * ```
 *
 * **Fallback Chain:**
 * WebGPU → WebWorkers → WASM → mathjs
 *
 * @module acceleration-router
 * @since 3.0.0
 */

import * as math from 'mathjs';
import {
  matrixMultiply as wasmMatrixMultiply,
  matrixDeterminant as wasmMatrixDeterminant,
  matrixTranspose as wasmMatrixTranspose,
  matrixAdd as wasmMatrixAdd,
  matrixSubtract as wasmMatrixSubtract,
  statsMean as wasmStatsMean,
  statsMedian as wasmStatsMedian,
  statsStd as wasmStatsStd,
  statsVariance as wasmStatsVariance,
  statsMin as wasmStatsMin,
  statsMax as wasmStatsMax,
  statsSum as wasmStatsSum,
  statsMode as wasmStatsMode,
  THRESHOLDS as WASM_THRESHOLDS,
} from './wasm-wrapper.js';
import {
  parallelMatrixMultiply,
  parallelMatrixTranspose,
  parallelMatrixAdd,
  parallelMatrixSubtract,
  PARALLEL_THRESHOLDS,
  shouldUseParallel,
} from './workers/parallel-matrix.js';
import {
  parallelStatsMean,
  parallelStatsSum,
  parallelStatsMin,
  parallelStatsMax,
  parallelStatsVariance,
  parallelStatsStd,
  PARALLEL_THRESHOLDS as PARALLEL_STATS_THRESHOLDS,
  shouldUseParallel as shouldUseParallelStats,
} from './workers/parallel-stats.js';
import { WorkerPool } from './workers/worker-pool.js';
import {
  gpuMatrixMultiply,
  gpuStatsMean,
  shouldUseGPU,
  GPU_THRESHOLDS,
  gpuInitialized,
} from './gpu/webgpu-wrapper.js';
import { logger } from './utils.js';

/**
 * Global worker pool instance.
 * Lazy initialized on first use.
 */
let workerPool: WorkerPool | null = null;

/**
 * Worker pool initialization status.
 */
let workerPoolInitialized = false;

/**
 * Acceleration tier used for an operation.
 */
export enum AccelerationTier {
  MATHJS = 'mathjs',
  WASM = 'wasm',
  WORKERS = 'workers',
  GPU = 'gpu',
}

/**
 * Performance tracking for routing decisions.
 */
interface RoutingStats {
  mathjsUsage: number;
  wasmUsage: number;
  workersUsage: number;
  gpuUsage: number;
}

const routingStats: RoutingStats = {
  mathjsUsage: 0,
  wasmUsage: 0,
  workersUsage: 0,
  gpuUsage: 0,
};

/**
 * Initializes the worker pool if not already initialized.
 *
 * @returns {Promise<WorkerPool | null>} Worker pool instance or null if unavailable
 */
async function getWorkerPool(): Promise<WorkerPool | null> {
  if (workerPoolInitialized) {
    return workerPool;
  }

  try {
    logger.info('Initializing worker pool for parallel operations...');
    const { cpus } = await import('os');
    workerPool = new WorkerPool({
      maxWorkers: Math.max(2, cpus().length - 1),
      minWorkers: 2,
      taskTimeout: 30000,
      enablePerformanceTracking: false,
    });

    await workerPool.initialize();
    workerPoolInitialized = true;

    logger.info('Worker pool initialized successfully', {
      workers: workerPool.getStats().totalWorkers,
    });

    return workerPool;
  } catch (error) {
    logger.warn('Worker pool initialization failed, will use WASM fallback', {
      error: error instanceof Error ? error.message : String(error),
    });
    workerPool = null;
    workerPoolInitialized = true; // Mark as initialized (but failed)
    return null;
  }
}

/**
 * Matrix multiplication with intelligent routing.
 *
 * @param {number[][]} a - First matrix (m×n)
 * @param {number[][]} b - Second matrix (n×p)
 * @returns {Promise<{result: number[][], tier: AccelerationTier}>} Result and tier used
 */
export async function routedMatrixMultiply(
  a: number[][],
  b: number[][]
): Promise<{ result: number[][]; tier: AccelerationTier }> {
  const size = Math.min(a.length, b.length);

  // Try GPU first (very large matrices)
  if (shouldUseGPU(size, 'matrix_multiply')) {
    try {
      logger.debug('Routing matrix multiply to GPU', { size });
      const result = await gpuMatrixMultiply(a, b);
      routingStats.gpuUsage++;
      return { result, tier: AccelerationTier.GPU };
    } catch (error) {
      logger.warn('GPU matrix multiply failed, falling back to workers', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Try WebWorkers (large matrices)
  if (shouldUseParallel(size, 'multiply')) {
    const pool = await getWorkerPool();
    if (pool) {
      try {
        logger.debug('Routing matrix multiply to workers', { size });
        const result = await parallelMatrixMultiply(a, b, pool);
        routingStats.workersUsage++;
        return { result, tier: AccelerationTier.WORKERS };
      } catch (error) {
        logger.warn('Worker matrix multiply failed, falling back to WASM', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  // Try WASM (medium matrices)
  if (size >= WASM_THRESHOLDS.matrix_multiply) {
    try {
      logger.debug('Routing matrix multiply to WASM', { size });
      const result = await wasmMatrixMultiply(a, b);
      routingStats.wasmUsage++;
      return { result, tier: AccelerationTier.WASM };
    } catch (error) {
      logger.warn('WASM matrix multiply failed, falling back to mathjs', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Fallback to mathjs (small matrices)
  logger.debug('Routing matrix multiply to mathjs', { size });
  const result = math.multiply(a, b) as number[][];
  routingStats.mathjsUsage++;
  return { result, tier: AccelerationTier.MATHJS };
}

/**
 * Matrix transpose with intelligent routing.
 *
 * @param {number[][]} matrix - Input matrix (m×n)
 * @returns {Promise<{result: number[][], tier: AccelerationTier}>} Result and tier used
 */
export async function routedMatrixTranspose(
  matrix: number[][]
): Promise<{ result: number[][]; tier: AccelerationTier }> {
  const size = matrix.length;

  // Try WebWorkers (large matrices)
  if (shouldUseParallel(size, 'transpose')) {
    const pool = await getWorkerPool();
    if (pool) {
      try {
        logger.debug('Routing matrix transpose to workers', { size });
        const result = await parallelMatrixTranspose(matrix, pool);
        routingStats.workersUsage++;
        return { result, tier: AccelerationTier.WORKERS };
      } catch (error) {
        logger.warn('Worker matrix transpose failed, falling back to WASM', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  // Try WASM (medium matrices)
  if (size >= WASM_THRESHOLDS.matrix_transpose) {
    try {
      logger.debug('Routing matrix transpose to WASM', { size });
      const result = await wasmMatrixTranspose(matrix);
      routingStats.wasmUsage++;
      return { result, tier: AccelerationTier.WASM };
    } catch (error) {
      logger.warn('WASM matrix transpose failed, falling back to mathjs', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Fallback to mathjs
  logger.debug('Routing matrix transpose to mathjs', { size });
  const result = math.transpose(matrix) as number[][];
  routingStats.mathjsUsage++;
  return { result, tier: AccelerationTier.MATHJS };
}

/**
 * Matrix addition with intelligent routing.
 *
 * @param {number[][]} a - First matrix
 * @param {number[][]} b - Second matrix
 * @returns {Promise<{result: number[][], tier: AccelerationTier}>} Result and tier used
 */
export async function routedMatrixAdd(
  a: number[][],
  b: number[][]
): Promise<{ result: number[][]; tier: AccelerationTier }> {
  const size = Math.min(a.length, b.length);

  // Try WebWorkers (large matrices)
  if (shouldUseParallel(size, 'add')) {
    const pool = await getWorkerPool();
    if (pool) {
      try {
        logger.debug('Routing matrix add to workers', { size });
        const result = await parallelMatrixAdd(a, b, pool);
        routingStats.workersUsage++;
        return { result, tier: AccelerationTier.WORKERS };
      } catch (error) {
        logger.warn('Worker matrix add failed, falling back to WASM', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  // Try WASM (medium matrices)
  if (size >= WASM_THRESHOLDS.matrix_transpose) {
    try {
      logger.debug('Routing matrix add to WASM', { size });
      const result = await wasmMatrixAdd(a, b);
      routingStats.wasmUsage++;
      return { result, tier: AccelerationTier.WASM };
    } catch (error) {
      logger.warn('WASM matrix add failed, falling back to mathjs', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Fallback to mathjs
  logger.debug('Routing matrix add to mathjs', { size });
  const result = math.add(a, b) as number[][];
  routingStats.mathjsUsage++;
  return { result, tier: AccelerationTier.MATHJS };
}

/**
 * Matrix subtraction with intelligent routing.
 *
 * @param {number[][]} a - First matrix
 * @param {number[][]} b - Second matrix
 * @returns {Promise<{result: number[][], tier: AccelerationTier}>} Result and tier used
 */
export async function routedMatrixSubtract(
  a: number[][],
  b: number[][]
): Promise<{ result: number[][]; tier: AccelerationTier }> {
  const size = Math.min(a.length, b.length);

  // Try WebWorkers (large matrices)
  if (shouldUseParallel(size, 'subtract')) {
    const pool = await getWorkerPool();
    if (pool) {
      try {
        logger.debug('Routing matrix subtract to workers', { size });
        const result = await parallelMatrixSubtract(a, b, pool);
        routingStats.workersUsage++;
        return { result, tier: AccelerationTier.WORKERS };
      } catch (error) {
        logger.warn('Worker matrix subtract failed, falling back to WASM', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  // Try WASM (medium matrices)
  if (size >= WASM_THRESHOLDS.matrix_transpose) {
    try {
      logger.debug('Routing matrix subtract to WASM', { size });
      const result = await wasmMatrixSubtract(a, b);
      routingStats.wasmUsage++;
      return { result, tier: AccelerationTier.WASM };
    } catch (error) {
      logger.warn('WASM matrix subtract failed, falling back to mathjs', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Fallback to mathjs
  logger.debug('Routing matrix subtract to mathjs', { size });
  const result = math.subtract(a, b) as number[][];
  routingStats.mathjsUsage++;
  return { result, tier: AccelerationTier.MATHJS };
}

/**
 * Statistical mean with intelligent routing.
 *
 * @param {number[]} data - Input array
 * @returns {Promise<{result: number, tier: AccelerationTier}>} Result and tier used
 */
export async function routedStatsMean(
  data: number[]
): Promise<{ result: number; tier: AccelerationTier }> {
  const size = data.length;

  // Try GPU first (massive datasets)
  if (shouldUseGPU(size, 'statistics')) {
    try {
      logger.debug('Routing stats mean to GPU', { size });
      const result = await gpuStatsMean(data);
      routingStats.gpuUsage++;
      return { result, tier: AccelerationTier.GPU };
    } catch (error) {
      logger.warn('GPU stats mean failed, falling back to workers', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Try WebWorkers (large datasets)
  if (shouldUseParallelStats(size, 'mean')) {
    const pool = await getWorkerPool();
    if (pool) {
      try {
        logger.debug('Routing stats mean to workers', { size });
        const result = await parallelStatsMean(data, pool);
        routingStats.workersUsage++;
        return { result, tier: AccelerationTier.WORKERS };
      } catch (error) {
        logger.warn('Worker stats mean failed, falling back to WASM', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  // Try WASM (medium datasets)
  if (size >= WASM_THRESHOLDS.statistics) {
    try {
      logger.debug('Routing stats mean to WASM', { size });
      const result = await wasmStatsMean(data);
      routingStats.wasmUsage++;
      return { result, tier: AccelerationTier.WASM };
    } catch (error) {
      logger.warn('WASM stats mean failed, falling back to mathjs', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Fallback to mathjs
  logger.debug('Routing stats mean to mathjs', { size });
  const result = math.mean(data) as number;
  routingStats.mathjsUsage++;
  return { result, tier: AccelerationTier.MATHJS };
}

/**
 * Gets routing statistics.
 *
 * @returns {RoutingStats & {totalOps: number, accelerationRate: string}} Routing stats
 */
export function getRoutingStats(): RoutingStats & { totalOps: number; accelerationRate: string } {
  const totalOps =
    routingStats.mathjsUsage +
    routingStats.wasmUsage +
    routingStats.workersUsage +
    routingStats.gpuUsage;

  const accelerated =
    routingStats.wasmUsage + routingStats.workersUsage + routingStats.gpuUsage;
  const accelerationRate = totalOps > 0 ? ((accelerated / totalOps) * 100).toFixed(1) + '%' : '0%';

  return {
    ...routingStats,
    totalOps,
    accelerationRate,
  };
}

/**
 * Resets routing statistics.
 */
export function resetRoutingStats(): void {
  routingStats.mathjsUsage = 0;
  routingStats.wasmUsage = 0;
  routingStats.workersUsage = 0;
  routingStats.gpuUsage = 0;
  logger.debug('Routing statistics reset');
}

/**
 * Shuts down the acceleration router and cleans up resources.
 *
 * @returns {Promise<void>}
 */
export async function shutdownAcceleration(): Promise<void> {
  if (workerPool) {
    logger.info('Shutting down worker pool...');
    await workerPool.shutdown();
    workerPool = null;
    workerPoolInitialized = false;
  }
}

// Re-export determinant (WASM only, not parallelizable easily)
export const routedMatrixDeterminant = wasmMatrixDeterminant;

// Re-export other stats functions (add routing later if needed)
export const routedStatsMedian = wasmStatsMedian;
export const routedStatsStd = wasmStatsStd;
export const routedStatsVariance = wasmStatsVariance;
export const routedStatsMin = wasmStatsMin;
export const routedStatsMax = wasmStatsMax;
export const routedStatsSum = wasmStatsSum;
export const routedStatsMode = wasmStatsMode;
