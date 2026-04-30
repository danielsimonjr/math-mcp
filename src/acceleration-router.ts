/**
 * @file acceleration-router.ts
 * @description Unified acceleration router for mathematical operations
 *
 * Routes operations through optimal acceleration tier based on size:
 * - Small data → mathjs (no overhead)
 * - Medium data → WASM (single-threaded)
 * - Large data → WebWorkers + WASM (multi-threaded)
 * - Very large → WebGPU (future)
 *
 * Fallback chain: GPU → Workers → WASM → mathjs
 *
 * @module acceleration-router
 * @since 3.0.0 (refactored 3.3.0)
 */

import math from './mathjs-shim.js';
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
import { logger } from './utils.js';

// GPU module types for dynamic import
type GpuModule = typeof import('./gpu/webgpu-wrapper.js');
let gpuModule: GpuModule | null = null;

/** Lazily loads GPU module on first use */
async function getGpuModule(): Promise<GpuModule> {
  if (!gpuModule) {
    gpuModule = await import('./gpu/webgpu-wrapper.js');
  }
  return gpuModule;
}

/** Checks if GPU should be used (loads module lazily) */
function shouldUseGPU(): boolean {
  // GPU is never used in Node.js - always return false without loading module
  return false;
}

/** GPU matrix multiply with lazy module loading */
async function gpuMatrixMultiply(a: number[][], b: number[][]): Promise<number[][]> {
  const gpu = await getGpuModule();
  return gpu.gpuMatrixMultiply(a, b);
}

/** GPU stats mean with lazy module loading */
async function gpuStatsMean(data: number[]): Promise<number> {
  const gpu = await getGpuModule();
  return gpu.gpuStatsMean(data);
}
import { AccelerationTier, getDegradationPolicy, type DegradationPolicy } from './degradation-policy.js';
import {
  routeWithFallback,
  createRoutingStats,
  computeRoutingStatsSummary,
  type RoutingStats,
  type TierExecutor,
} from './routing-utils.js';

// Re-exports
export { AccelerationTier } from './degradation-policy.js';

// Note: the deprecated function-style API (routedMatrixMultiply, etc.) lives
// in `./acceleration-router-compat.ts`. It is intentionally NOT re-exported
// here — that re-export caused a circular import between the two modules
// and was untidy in tree-shaking. Consumers that still rely on the function
// API should import from `./acceleration-router-compat.js` directly.

/** Router configuration */
export interface AccelerationRouterConfig {
  enableWorkers?: boolean;
  workerPoolConfig?: WorkerPoolConfig;
  degradationPolicy?: DegradationPolicy;
}

/**
 * Acceleration router with intelligent tier-based routing.
 * Routes operations through GPU → Workers → WASM → mathjs based on data size.
 */
export class AccelerationRouter {
  private workerPool: WorkerPool | null = null;
  private workerPoolInitialized = false;
  private readonly workerPoolInjected: boolean;
  private readonly routingStats: RoutingStats;
  private readonly config: Required<AccelerationRouterConfig>;

  constructor(config: AccelerationRouterConfig = {}, workerPool?: WorkerPool) {
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

    this.routingStats = createRoutingStats();

    if (workerPool) {
      this.workerPool = workerPool;
      this.workerPoolInitialized = true;
      this.workerPoolInjected = true;
    } else {
      this.workerPoolInjected = false;
    }
  }

  /** Initialize router and worker pool */
  async initialize(): Promise<void> {
    if (this.workerPoolInitialized) return;

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
      logger.info('Worker pool initialized', { workers: this.workerPool.getStats().totalWorkers });
    } catch (error) {
      logger.warn('Worker pool initialization failed, using WASM fallback', {
        error: error instanceof Error ? error.message : String(error),
      });
      this.workerPool = null;
      this.workerPoolInitialized = true;
    }
  }

  /** Shutdown router and cleanup resources */
  async shutdown(): Promise<void> {
    if (this.workerPool && !this.workerPoolInjected) {
      logger.info('Shutting down worker pool...');
      await this.workerPool.shutdown();
    }
    this.workerPool = null;
    this.workerPoolInitialized = false;
  }

  private getPool(): WorkerPool | null {
    return this.workerPool;
  }

  // ============================================================================
  // Matrix Operations
  // ============================================================================

  /** Matrix multiply with intelligent routing */
  async matrixMultiply(a: number[][], b: number[][]): Promise<{ result: number[][]; tier: AccelerationTier }> {
    const size = Math.min(a.length, b.length);
    const pool = this.getPool();

    const tiers: TierExecutor<number[][]>[] = [
      {
        tier: AccelerationTier.GPU,
        shouldUse: () => shouldUseGPU(),
        execute: () => gpuMatrixMultiply(a, b),
      },
      {
        tier: AccelerationTier.WORKERS,
        shouldUse: () => !!pool && shouldUseParallel(size, 'multiply'),
        execute: () => parallelMatrixMultiply(a, b, pool!),
      },
      {
        tier: AccelerationTier.WASM,
        shouldUse: () => size >= WASM_THRESHOLDS.matrix_multiply,
        execute: () => wasmMatrixMultiply(a, b),
      },
    ];

    return routeWithFallback(
      { operation: 'matrix_multiply', size, tiers, fallback: () => math.multiply(a, b) as number[][] },
      this.routingStats
    );
  }

  /** Matrix transpose with intelligent routing */
  async matrixTranspose(matrix: number[][]): Promise<{ result: number[][]; tier: AccelerationTier }> {
    const size = matrix.length;
    const pool = this.getPool();

    const tiers: TierExecutor<number[][]>[] = [
      {
        tier: AccelerationTier.WORKERS,
        shouldUse: () => !!pool && shouldUseParallel(size, 'transpose'),
        execute: () => parallelMatrixTranspose(matrix, pool!),
      },
      {
        tier: AccelerationTier.WASM,
        shouldUse: () => size >= WASM_THRESHOLDS.matrix_transpose,
        execute: () => wasmMatrixTranspose(matrix),
      },
    ];

    return routeWithFallback(
      { operation: 'matrix_transpose', size, tiers, fallback: () => math.transpose(matrix) as number[][] },
      this.routingStats
    );
  }

  /** Matrix add with intelligent routing */
  async matrixAdd(a: number[][], b: number[][]): Promise<{ result: number[][]; tier: AccelerationTier }> {
    const size = Math.min(a.length, b.length);
    const pool = this.getPool();

    const tiers: TierExecutor<number[][]>[] = [
      {
        tier: AccelerationTier.WORKERS,
        shouldUse: () => !!pool && shouldUseParallel(size, 'add'),
        execute: () => parallelMatrixAdd(a, b, pool!),
      },
      {
        tier: AccelerationTier.WASM,
        shouldUse: () => size >= WASM_THRESHOLDS.matrix_add_sub,
        execute: () => wasmMatrixAdd(a, b),
      },
    ];

    return routeWithFallback(
      { operation: 'matrix_add', size, tiers, fallback: () => math.add(a, b) as number[][] },
      this.routingStats
    );
  }

  /** Matrix subtract with intelligent routing */
  async matrixSubtract(a: number[][], b: number[][]): Promise<{ result: number[][]; tier: AccelerationTier }> {
    const size = Math.min(a.length, b.length);
    const pool = this.getPool();

    const tiers: TierExecutor<number[][]>[] = [
      {
        tier: AccelerationTier.WORKERS,
        shouldUse: () => !!pool && shouldUseParallel(size, 'subtract'),
        execute: () => parallelMatrixSubtract(a, b, pool!),
      },
      {
        tier: AccelerationTier.WASM,
        shouldUse: () => size >= WASM_THRESHOLDS.matrix_add_sub,
        execute: () => wasmMatrixSubtract(a, b),
      },
    ];

    return routeWithFallback(
      { operation: 'matrix_subtract', size, tiers, fallback: () => math.subtract(a, b) as number[][] },
      this.routingStats
    );
  }

  // ============================================================================
  // Statistics Operations
  // ============================================================================

  /** Statistical mean with intelligent routing */
  async statsMean(data: number[]): Promise<{ result: number; tier: AccelerationTier }> {
    const size = data.length;
    const pool = this.getPool();

    const tiers: TierExecutor<number>[] = [
      {
        tier: AccelerationTier.GPU,
        shouldUse: () => shouldUseGPU(),
        execute: () => gpuStatsMean(data),
      },
      {
        tier: AccelerationTier.WORKERS,
        shouldUse: () => !!pool && shouldUseParallelStats(size, 'mean'),
        execute: () => parallelStatsMean(data, pool!),
      },
      {
        tier: AccelerationTier.WASM,
        shouldUse: () => size >= WASM_THRESHOLDS.statistics,
        execute: () => wasmStatsMean(data),
      },
    ];

    return routeWithFallback(
      { operation: 'stats_mean', size, tiers, fallback: () => math.mean(data) as number },
      this.routingStats
    );
  }

  // ============================================================================
  // Simple WASM Delegations (no routing needed)
  // ============================================================================

  /** Matrix determinant (WASM) */
  async matrixDeterminant(matrix: number[][]): Promise<number> {
    return wasmMatrixDeterminant(matrix);
  }

  /** Statistical median (WASM) */
  async statsMedian(data: number[]): Promise<number> {
    return wasmStatsMedian(data);
  }

  /** Statistical std (WASM) */
  async statsStd(data: number[]): Promise<number> {
    return wasmStatsStd(data);
  }

  /** Statistical variance (WASM) */
  async statsVariance(data: number[]): Promise<number> {
    return wasmStatsVariance(data);
  }

  /** Statistical min (WASM) */
  async statsMin(data: number[]): Promise<number> {
    return wasmStatsMin(data);
  }

  /** Statistical max (WASM) */
  async statsMax(data: number[]): Promise<number> {
    return wasmStatsMax(data);
  }

  /** Statistical sum (WASM) */
  async statsSum(data: number[]): Promise<number> {
    return wasmStatsSum(data);
  }

  /** Statistical mode (WASM) */
  async statsMode(data: number[]): Promise<number | number[]> {
    return wasmStatsMode(data);
  }

  // ============================================================================
  // Statistics
  // ============================================================================

  /** Get routing statistics */
  getRoutingStats() {
    return computeRoutingStatsSummary(this.routingStats);
  }

  /** Reset routing statistics */
  resetRoutingStats(): void {
    this.routingStats.mathjsUsage = 0;
    this.routingStats.wasmUsage = 0;
    this.routingStats.workersUsage = 0;
    this.routingStats.gpuUsage = 0;
    logger.debug('Routing statistics reset');
  }
}
