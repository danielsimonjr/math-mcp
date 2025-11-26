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
  shouldUseParallel,
} from './workers/parallel-matrix.js';
import {
  parallelStatsMean,
  shouldUseParallel as shouldUseParallelStats,
} from './workers/parallel-stats.js';
import { WorkerPool } from './workers/worker-pool.js';
import type { WorkerPoolConfig } from './workers/worker-types.js';
import {
  gpuMatrixMultiply,
  gpuStatsMean,
  shouldUseGPU,
} from './gpu/webgpu-wrapper.js';
import { logger } from './utils.js';
import {
  AccelerationTier,
  isTierEnabled,
  logDegradation,
  getDegradationPolicy,
  type DegradationPolicy,
} from './degradation-policy.js';

/**
 * Re-export AccelerationTier from degradation-policy for convenience.
 */
export { AccelerationTier } from './degradation-policy.js';

/**
 * Performance tracking for routing decisions.
 */
interface RoutingStats {
  mathjsUsage: number;
  wasmUsage: number;
  workersUsage: number;
  gpuUsage: number;
}

/**
 * Configuration for the acceleration router.
 */
export interface AccelerationRouterConfig {
  /** Enable workers tier */
  enableWorkers?: boolean;

  /** Worker pool configuration */
  workerPoolConfig?: WorkerPoolConfig;

  /** Degradation policy */
  degradationPolicy?: DegradationPolicy;
}

/**
 * Acceleration router with dependency injection support.
 *
 * Provides intelligent routing of mathematical operations through
 * the optimal acceleration layer (GPU → Workers → WASM → mathjs).
 *
 * @example
 * ```typescript
 * // Create router with default configuration
 * const router = new AccelerationRouter();
 * await router.initialize();
 *
 * // Use router
 * const { result, tier } = await router.matrixMultiply(a, b);
 *
 * // Shutdown
 * await router.shutdown();
 * ```
 *
 * @example
 * ```typescript
 * // Create router with injected worker pool
 * const pool = new WorkerPool({ maxWorkers: 4 });
 * await pool.initialize();
 *
 * const router = new AccelerationRouter({}, pool);
 * await router.initialize(); // No-op since pool already provided
 * ```
 */
export class AccelerationRouter {
  private workerPool: WorkerPool | null = null;
  private workerPoolInitialized = false;
  private readonly workerPoolInjected: boolean; // Track if pool was injected
  private readonly routingStats: RoutingStats = {
    mathjsUsage: 0,
    wasmUsage: 0,
    workersUsage: 0,
    gpuUsage: 0,
  };
  private readonly config: Required<AccelerationRouterConfig>;

  /**
   * Creates a new acceleration router.
   *
   * @param config - Router configuration
   * @param workerPool - Optional pre-initialized worker pool (for DI)
   */
  constructor(
    config: AccelerationRouterConfig = {},
    workerPool?: WorkerPool
  ) {
    this.config = {
      enableWorkers: config.enableWorkers ?? true,
      workerPoolConfig: config.workerPoolConfig ?? {
        maxWorkers: 8,
        minWorkers: 2,
        taskTimeout: 30000,
        enablePerformanceTracking: false,
      },
      degradationPolicy: config.degradationPolicy ?? getDegradationPolicy(),
    };

    // Support dependency injection of worker pool
    if (workerPool) {
      this.workerPool = workerPool;
      this.workerPoolInitialized = true;
      this.workerPoolInjected = true;
    } else {
      this.workerPoolInjected = false;
    }
  }

  /**
   * Initializes the router and worker pool if not already initialized.
   *
   * @returns Promise that resolves when initialization is complete
   */
  async initialize(): Promise<void> {
    // If pool was injected, nothing to do
    if (this.workerPoolInitialized) {
      return;
    }

    // Only create pool if workers are enabled
    if (!this.config.enableWorkers) {
      logger.info('Workers disabled, skipping worker pool initialization');
      this.workerPoolInitialized = true;
      return;
    }

    try {
      logger.info('Initializing worker pool for parallel operations...');
      const { cpus } = await import('os');

      const poolConfig: WorkerPoolConfig = {
        ...this.config.workerPoolConfig,
        maxWorkers: this.config.workerPoolConfig.maxWorkers ?? Math.max(2, cpus().length - 1),
      };

      this.workerPool = new WorkerPool(poolConfig);
      await this.workerPool.initialize();
      this.workerPoolInitialized = true;

      logger.info('Worker pool initialized successfully', {
        workers: this.workerPool.getStats().totalWorkers,
      });
    } catch (error) {
      logger.warn('Worker pool initialization failed, will use WASM fallback', {
        error: error instanceof Error ? error.message : String(error),
      });
      this.workerPool = null;
      this.workerPoolInitialized = true; // Mark as initialized (but failed)
    }
  }

  /**
   * Shuts down the router and cleans up resources.
   *
   * Note: If a worker pool was injected via constructor, it will NOT be shut down.
   * The caller is responsible for managing the lifecycle of injected dependencies.
   *
   * @returns Promise that resolves when shutdown is complete
   */
  async shutdown(): Promise<void> {
    // Only shutdown pool if we created it (not injected)
    if (this.workerPool && !this.workerPoolInjected) {
      logger.info('Shutting down worker pool...');
      await this.workerPool.shutdown();
      this.workerPool = null;
      this.workerPoolInitialized = false;
    } else if (this.workerPoolInjected) {
      logger.debug('Skipping shutdown of injected worker pool');
      // Clear reference but don't shutdown
      this.workerPool = null;
      this.workerPoolInitialized = false;
    }
  }

  /**
   * Gets the worker pool instance.
   *
   * @returns Worker pool instance or null if unavailable
   */
  private getWorkerPool(): WorkerPool | null {
    return this.workerPool;
  }

  /**
   * Matrix multiplication with intelligent routing.
   *
   * @param a - First matrix (m×n)
   * @param b - Second matrix (n×p)
   * @returns Result and tier used
   */
  async matrixMultiply(
    a: number[][],
    b: number[][]
  ): Promise<{ result: number[][]; tier: AccelerationTier }> {
    const size = Math.min(a.length, b.length);

    // Try GPU first (very large matrices)
    if (isTierEnabled(AccelerationTier.GPU) && shouldUseGPU(size, 'matrix_multiply')) {
      try {
        logger.debug('Routing matrix multiply to GPU', { size });
        const result = await gpuMatrixMultiply(a, b);
        this.routingStats.gpuUsage++;
        return { result, tier: AccelerationTier.GPU };
      } catch (error) {
        logDegradation(
          'matrix_multiply',
          AccelerationTier.GPU,
          AccelerationTier.WORKERS,
          error instanceof Error ? error : undefined
        );
      }
    }

    // Try WebWorkers (large matrices)
    if (isTierEnabled(AccelerationTier.WORKERS) && shouldUseParallel(size, 'multiply')) {
      const pool = this.getWorkerPool();
      if (pool) {
        try {
          logger.debug('Routing matrix multiply to workers', { size });
          const result = await parallelMatrixMultiply(a, b, pool);
          this.routingStats.workersUsage++;
          return { result, tier: AccelerationTier.WORKERS };
        } catch (error) {
          logDegradation(
            'matrix_multiply',
            AccelerationTier.WORKERS,
            AccelerationTier.WASM,
            error instanceof Error ? error : undefined
          );
        }
      }
    }

    // Try WASM (medium matrices)
    if (isTierEnabled(AccelerationTier.WASM) && size >= WASM_THRESHOLDS.matrix_multiply) {
      try {
        logger.debug('Routing matrix multiply to WASM', { size });
        const result = await wasmMatrixMultiply(a, b);
        this.routingStats.wasmUsage++;
        return { result, tier: AccelerationTier.WASM };
      } catch (error) {
        logDegradation(
          'matrix_multiply',
          AccelerationTier.WASM,
          AccelerationTier.MATHJS,
          error instanceof Error ? error : undefined
        );
      }
    }

    // Fallback to mathjs (small matrices)
    logger.debug('Routing matrix multiply to mathjs', { size });
    const result = math.multiply(a, b) as number[][];
    this.routingStats.mathjsUsage++;
    return { result, tier: AccelerationTier.MATHJS };
  }

  /**
   * Matrix transpose with intelligent routing.
   *
   * @param matrix - Input matrix (m×n)
   * @returns Result and tier used
   */
  async matrixTranspose(
    matrix: number[][]
  ): Promise<{ result: number[][]; tier: AccelerationTier }> {
    const size = matrix.length;

    // Try WebWorkers (large matrices)
    if (isTierEnabled(AccelerationTier.WORKERS) && shouldUseParallel(size, 'transpose')) {
      const pool = this.getWorkerPool();
      if (pool) {
        try {
          logger.debug('Routing matrix transpose to workers', { size });
          const result = await parallelMatrixTranspose(matrix, pool);
          this.routingStats.workersUsage++;
          return { result, tier: AccelerationTier.WORKERS };
        } catch (error) {
          logDegradation(
            'matrix_transpose',
            AccelerationTier.WORKERS,
            AccelerationTier.WASM,
            error instanceof Error ? error : undefined
          );
        }
      }
    }

    // Try WASM (medium matrices)
    if (isTierEnabled(AccelerationTier.WASM) && size >= WASM_THRESHOLDS.matrix_transpose) {
      try {
        logger.debug('Routing matrix transpose to WASM', { size });
        const result = await wasmMatrixTranspose(matrix);
        this.routingStats.wasmUsage++;
        return { result, tier: AccelerationTier.WASM };
      } catch (error) {
        logDegradation(
          'matrix_transpose',
          AccelerationTier.WASM,
          AccelerationTier.MATHJS,
          error instanceof Error ? error : undefined
        );
      }
    }

    // Fallback to mathjs
    logger.debug('Routing matrix transpose to mathjs', { size });
    const result = math.transpose(matrix) as number[][];
    this.routingStats.mathjsUsage++;
    return { result, tier: AccelerationTier.MATHJS };
  }

  /**
   * Matrix addition with intelligent routing.
   *
   * @param a - First matrix
   * @param b - Second matrix
   * @returns Result and tier used
   */
  async matrixAdd(
    a: number[][],
    b: number[][]
  ): Promise<{ result: number[][]; tier: AccelerationTier }> {
    const size = Math.min(a.length, b.length);

    // Try WebWorkers (large matrices)
    if (isTierEnabled(AccelerationTier.WORKERS) && shouldUseParallel(size, 'add')) {
      const pool = this.getWorkerPool();
      if (pool) {
        try {
          logger.debug('Routing matrix add to workers', { size });
          const result = await parallelMatrixAdd(a, b, pool);
          this.routingStats.workersUsage++;
          return { result, tier: AccelerationTier.WORKERS };
        } catch (error) {
          logDegradation(
            'matrix_add',
            AccelerationTier.WORKERS,
            AccelerationTier.WASM,
            error instanceof Error ? error : undefined
          );
        }
      }
    }

    // Try WASM (medium matrices)
    if (isTierEnabled(AccelerationTier.WASM) && size >= WASM_THRESHOLDS.matrix_transpose) {
      try {
        logger.debug('Routing matrix add to WASM', { size });
        const result = await wasmMatrixAdd(a, b);
        this.routingStats.wasmUsage++;
        return { result, tier: AccelerationTier.WASM };
      } catch (error) {
        logDegradation(
          'matrix_add',
          AccelerationTier.WASM,
          AccelerationTier.MATHJS,
          error instanceof Error ? error : undefined
        );
      }
    }

    // Fallback to mathjs
    logger.debug('Routing matrix add to mathjs', { size });
    const result = math.add(a, b) as number[][];
    this.routingStats.mathjsUsage++;
    return { result, tier: AccelerationTier.MATHJS };
  }

  /**
   * Matrix subtraction with intelligent routing.
   *
   * @param a - First matrix
   * @param b - Second matrix
   * @returns Result and tier used
   */
  async matrixSubtract(
    a: number[][],
    b: number[][]
  ): Promise<{ result: number[][]; tier: AccelerationTier }> {
    const size = Math.min(a.length, b.length);

    // Try WebWorkers (large matrices)
    if (isTierEnabled(AccelerationTier.WORKERS) && shouldUseParallel(size, 'subtract')) {
      const pool = this.getWorkerPool();
      if (pool) {
        try {
          logger.debug('Routing matrix subtract to workers', { size });
          const result = await parallelMatrixSubtract(a, b, pool);
          this.routingStats.workersUsage++;
          return { result, tier: AccelerationTier.WORKERS };
        } catch (error) {
          logDegradation(
            'matrix_subtract',
            AccelerationTier.WORKERS,
            AccelerationTier.WASM,
            error instanceof Error ? error : undefined
          );
        }
      }
    }

    // Try WASM (medium matrices)
    if (isTierEnabled(AccelerationTier.WASM) && size >= WASM_THRESHOLDS.matrix_transpose) {
      try {
        logger.debug('Routing matrix subtract to WASM', { size });
        const result = await wasmMatrixSubtract(a, b);
        this.routingStats.wasmUsage++;
        return { result, tier: AccelerationTier.WASM };
      } catch (error) {
        logDegradation(
          'matrix_subtract',
          AccelerationTier.WASM,
          AccelerationTier.MATHJS,
          error instanceof Error ? error : undefined
        );
      }
    }

    // Fallback to mathjs
    logger.debug('Routing matrix subtract to mathjs', { size });
    const result = math.subtract(a, b) as number[][];
    this.routingStats.mathjsUsage++;
    return { result, tier: AccelerationTier.MATHJS };
  }

  /**
   * Statistical mean with intelligent routing.
   *
   * @param data - Input array
   * @returns Result and tier used
   */
  async statsMean(
    data: number[]
  ): Promise<{ result: number; tier: AccelerationTier }> {
    const size = data.length;

    // Try GPU first (massive datasets)
    if (isTierEnabled(AccelerationTier.GPU) && shouldUseGPU(size, 'statistics')) {
      try {
        logger.debug('Routing stats mean to GPU', { size });
        const result = await gpuStatsMean(data);
        this.routingStats.gpuUsage++;
        return { result, tier: AccelerationTier.GPU };
      } catch (error) {
        logDegradation(
          'stats_mean',
          AccelerationTier.GPU,
          AccelerationTier.WORKERS,
          error instanceof Error ? error : undefined
        );
      }
    }

    // Try WebWorkers (large datasets)
    if (isTierEnabled(AccelerationTier.WORKERS) && shouldUseParallelStats(size, 'mean')) {
      const pool = this.getWorkerPool();
      if (pool) {
        try {
          logger.debug('Routing stats mean to workers', { size });
          const result = await parallelStatsMean(data, pool);
          this.routingStats.workersUsage++;
          return { result, tier: AccelerationTier.WORKERS };
        } catch (error) {
          logDegradation(
            'stats_mean',
            AccelerationTier.WORKERS,
            AccelerationTier.WASM,
            error instanceof Error ? error : undefined
          );
        }
      }
    }

    // Try WASM (medium datasets)
    if (isTierEnabled(AccelerationTier.WASM) && size >= WASM_THRESHOLDS.statistics) {
      try {
        logger.debug('Routing stats mean to WASM', { size });
        const result = await wasmStatsMean(data);
        this.routingStats.wasmUsage++;
        return { result, tier: AccelerationTier.WASM };
      } catch (error) {
        logDegradation(
          'stats_mean',
          AccelerationTier.WASM,
          AccelerationTier.MATHJS,
          error instanceof Error ? error : undefined
        );
      }
    }

    // Fallback to mathjs
    logger.debug('Routing stats mean to mathjs', { size });
    const result = math.mean(data) as number;
    this.routingStats.mathjsUsage++;
    return { result, tier: AccelerationTier.MATHJS };
  }

  /**
   * Matrix determinant (WASM only, not parallelizable easily).
   *
   * @param matrix - Input matrix
   * @returns Matrix determinant
   */
  async matrixDeterminant(matrix: number[][]): Promise<number> {
    return wasmMatrixDeterminant(matrix);
  }

  /**
   * Statistical median (WASM).
   *
   * @param data - Input array
   * @returns Median value
   */
  async statsMedian(data: number[]): Promise<number> {
    return wasmStatsMedian(data);
  }

  /**
   * Statistical standard deviation (WASM).
   *
   * @param data - Input array
   * @returns Standard deviation
   */
  async statsStd(data: number[]): Promise<number> {
    return wasmStatsStd(data);
  }

  /**
   * Statistical variance (WASM).
   *
   * @param data - Input array
   * @returns Variance
   */
  async statsVariance(data: number[]): Promise<number> {
    return wasmStatsVariance(data);
  }

  /**
   * Statistical minimum (WASM).
   *
   * @param data - Input array
   * @returns Minimum value
   */
  async statsMin(data: number[]): Promise<number> {
    return wasmStatsMin(data);
  }

  /**
   * Statistical maximum (WASM).
   *
   * @param data - Input array
   * @returns Maximum value
   */
  async statsMax(data: number[]): Promise<number> {
    return wasmStatsMax(data);
  }

  /**
   * Statistical sum (WASM).
   *
   * @param data - Input array
   * @returns Sum of all values
   */
  async statsSum(data: number[]): Promise<number> {
    return wasmStatsSum(data);
  }

  /**
   * Statistical mode (WASM).
   *
   * @param data - Input array
   * @returns Mode value(s) - can be single number or array if multiple modes
   */
  async statsMode(data: number[]): Promise<number | number[]> {
    return wasmStatsMode(data);
  }

  /**
   * Gets routing statistics.
   *
   * @returns Routing stats with total operations and acceleration rate
   */
  getRoutingStats(): RoutingStats & { totalOps: number; accelerationRate: string } {
    const totalOps =
      this.routingStats.mathjsUsage +
      this.routingStats.wasmUsage +
      this.routingStats.workersUsage +
      this.routingStats.gpuUsage;

    const accelerated =
      this.routingStats.wasmUsage + this.routingStats.workersUsage + this.routingStats.gpuUsage;
    const accelerationRate = totalOps > 0 ? ((accelerated / totalOps) * 100).toFixed(1) + '%' : '0%';

    return {
      ...this.routingStats,
      totalOps,
      accelerationRate,
    };
  }

  /**
   * Resets routing statistics.
   */
  resetRoutingStats(): void {
    this.routingStats.mathjsUsage = 0;
    this.routingStats.wasmUsage = 0;
    this.routingStats.workersUsage = 0;
    this.routingStats.gpuUsage = 0;
    logger.debug('Routing statistics reset');
  }
}

// ====================
// Backward Compatibility Layer
// ====================

/**
 * Default router instance for backward compatibility.
 * @deprecated Use AccelerationRouter class directly for better testability.
 */
const defaultRouter = new AccelerationRouter();

/**
 * @deprecated Use router.initialize() instead
 */
let _defaultRouterInitialized = false;

/**
 * Ensures default router is initialized.
 * @deprecated Use AccelerationRouter class directly
 */
async function ensureDefaultRouterInitialized(): Promise<void> {
  if (!_defaultRouterInitialized) {
    await defaultRouter.initialize();
    _defaultRouterInitialized = true;
  }
}

/**
 * @deprecated Use AccelerationRouter.matrixMultiply() instead
 */
export async function routedMatrixMultiply(
  a: number[][],
  b: number[][]
): Promise<{ result: number[][]; tier: AccelerationTier }> {
  await ensureDefaultRouterInitialized();
  return defaultRouter.matrixMultiply(a, b);
}

/**
 * @deprecated Use AccelerationRouter.matrixTranspose() instead
 */
export async function routedMatrixTranspose(
  matrix: number[][]
): Promise<{ result: number[][]; tier: AccelerationTier }> {
  await ensureDefaultRouterInitialized();
  return defaultRouter.matrixTranspose(matrix);
}

/**
 * @deprecated Use AccelerationRouter.matrixAdd() instead
 */
export async function routedMatrixAdd(
  a: number[][],
  b: number[][]
): Promise<{ result: number[][]; tier: AccelerationTier }> {
  await ensureDefaultRouterInitialized();
  return defaultRouter.matrixAdd(a, b);
}

/**
 * @deprecated Use AccelerationRouter.matrixSubtract() instead
 */
export async function routedMatrixSubtract(
  a: number[][],
  b: number[][]
): Promise<{ result: number[][]; tier: AccelerationTier }> {
  await ensureDefaultRouterInitialized();
  return defaultRouter.matrixSubtract(a, b);
}

/**
 * @deprecated Use AccelerationRouter.statsMean() instead
 */
export async function routedStatsMean(
  data: number[]
): Promise<{ result: number; tier: AccelerationTier }> {
  await ensureDefaultRouterInitialized();
  return defaultRouter.statsMean(data);
}

/**
 * @deprecated Use AccelerationRouter.getRoutingStats() instead
 */
export function getRoutingStats(): RoutingStats & { totalOps: number; accelerationRate: string } {
  return defaultRouter.getRoutingStats();
}

/**
 * @deprecated Use AccelerationRouter.resetRoutingStats() instead
 */
export function resetRoutingStats(): void {
  defaultRouter.resetRoutingStats();
}

/**
 * @deprecated Use AccelerationRouter.shutdown() instead
 */
export async function shutdownAcceleration(): Promise<void> {
  await defaultRouter.shutdown();
  _defaultRouterInitialized = false;
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
