/**
 * @file pool-manager.ts
 * @description Manager for multiple worker pools
 *
 * Provides centralized management of multiple worker pools, allowing
 * separate pools for different operation types (e.g., matrix vs stats).
 *
 * @module workers/pool-manager
 * @since 3.2.0
 */

import { WorkerPool } from './worker-pool.js';
import type { WorkerPoolConfig } from './worker-types.js';
import { logger } from '../shared/logger.js';

/**
 * Manages multiple worker pools for different operation types.
 *
 * Allows creating separate pools for different workloads, improving
 * resource allocation and preventing one operation type from starving others.
 *
 * @example
 * ```typescript
 * const manager = new WorkerPoolManager();
 *
 * // Create separate pools for matrix and stats
 * const matrixPool = await manager.createPool('matrix', { maxWorkers: 4 });
 * const statsPool = await manager.createPool('stats', { maxWorkers: 4 });
 *
 * // Get pool by name
 * const pool = manager.getPool('matrix');
 *
 * // Get statistics for all pools
 * const allStats = manager.getAllStats();
 *
 * // Shutdown all pools
 * await manager.shutdownAll();
 * ```
 */
export class WorkerPoolManager {
  private readonly pools: Map<string, WorkerPool> = new Map();

  /**
   * Creates a new worker pool with the given name and configuration.
   *
   * @param name - Unique name for the pool
   * @param config - Worker pool configuration
   * @returns The created and initialized worker pool
   * @throws Error if pool with name already exists
   *
   * @example
   * ```typescript
   * const pool = await manager.createPool('matrix-ops', {
   *   maxWorkers: 4,
   *   minWorkers: 2,
   *   taskTimeout: 30000
   * });
   * ```
   */
  async createPool(
    name: string,
    config: WorkerPoolConfig
  ): Promise<WorkerPool> {
    if (this.pools.has(name)) {
      throw new Error(`Worker pool '${name}' already exists`);
    }

    logger.info('Creating worker pool', { name, config });

    const pool = new WorkerPool(config);
    await pool.initialize();

    this.pools.set(name, pool);

    logger.info('Worker pool created successfully', {
      name,
      workers: pool.getStats().totalWorkers,
    });

    return pool;
  }

  /**
   * Gets an existing worker pool by name.
   *
   * @param name - Pool name
   * @returns The worker pool or undefined if not found
   *
   * @example
   * ```typescript
   * const pool = manager.getPool('matrix-ops');
   * if (pool) {
   *   // Use pool
   * }
   * ```
   */
  getPool(name: string): WorkerPool | undefined {
    return this.pools.get(name);
  }

  /**
   * Checks if a pool with the given name exists.
   *
   * @param name - Pool name to check
   * @returns True if pool exists, false otherwise
   *
   * @example
   * ```typescript
   * if (manager.hasPool('matrix-ops')) {
   *   const pool = manager.getPool('matrix-ops');
   * }
   * ```
   */
  hasPool(name: string): boolean {
    return this.pools.has(name);
  }

  /**
   * Gets all pool names.
   *
   * @returns Array of pool names
   *
   * @example
   * ```typescript
   * const names = manager.getPoolNames();
   * // ['matrix-ops', 'stats-ops', 'gpu-ops']
   * ```
   */
  getPoolNames(): string[] {
    return Array.from(this.pools.keys());
  }

  /**
   * Gets statistics for all pools.
   *
   * @returns Map of pool name to pool statistics
   *
   * @example
   * ```typescript
   * const stats = manager.getAllStats();
   * for (const [name, poolStats] of stats) {
   *   console.log(`Pool ${name}:`, poolStats);
   * }
   * ```
   */
  getAllStats(): Map<string, ReturnType<WorkerPool['getStats']>> {
    const stats = new Map<string, ReturnType<WorkerPool['getStats']>>();

    for (const [name, pool] of this.pools) {
      stats.set(name, pool.getStats());
    }

    return stats;
  }

  /**
   * Gets aggregate statistics across all pools.
   *
   * @returns Aggregate statistics
   *
   * @example
   * ```typescript
   * const aggregate = manager.getAggregateStats();
   * console.log(`Total workers: ${aggregate.totalWorkers}`);
   * console.log(`Total tasks completed: ${aggregate.tasksCompleted}`);
   * ```
   */
  getAggregateStats(): {
    totalPools: number;
    totalWorkers: number;
    idleWorkers: number;
    busyWorkers: number;
    queueSize: number;
    tasksCompleted: number;
    tasksFailed: number;
    avgExecutionTime: number;
  } {
    let totalWorkers = 0;
    let idleWorkers = 0;
    let busyWorkers = 0;
    let queueSize = 0;
    let tasksCompleted = 0;
    let tasksFailed = 0;
    let totalExecutionTime = 0;
    let poolsWithExecTime = 0;

    for (const pool of this.pools.values()) {
      const stats = pool.getStats();
      totalWorkers += stats.totalWorkers;
      idleWorkers += stats.idleWorkers;
      busyWorkers += stats.busyWorkers;
      queueSize += stats.queueSize;
      tasksCompleted += stats.tasksCompleted;
      tasksFailed += stats.tasksFailed;
      if (stats.avgExecutionTime > 0) {
        totalExecutionTime += stats.avgExecutionTime;
        poolsWithExecTime++;
      }
    }

    const avgExecutionTime = poolsWithExecTime > 0
      ? totalExecutionTime / poolsWithExecTime
      : 0;

    return {
      totalPools: this.pools.size,
      totalWorkers,
      idleWorkers,
      busyWorkers,
      queueSize,
      tasksCompleted,
      tasksFailed,
      avgExecutionTime,
    };
  }

  /**
   * Removes and shuts down a pool by name.
   *
   * @param name - Pool name to remove
   * @returns True if pool was removed, false if not found
   *
   * @example
   * ```typescript
   * const removed = await manager.removePool('matrix-ops');
   * if (removed) {
   *   console.log('Pool removed successfully');
   * }
   * ```
   */
  async removePool(name: string): Promise<boolean> {
    const pool = this.pools.get(name);

    if (!pool) {
      logger.warn('Attempted to remove non-existent pool', { name });
      return false;
    }

    logger.info('Removing worker pool', { name });

    await pool.shutdown();
    this.pools.delete(name);

    logger.info('Worker pool removed successfully', { name });

    return true;
  }

  /**
   * Shuts down all worker pools.
   *
   * @returns Promise that resolves when all pools are shut down
   *
   * @example
   * ```typescript
   * // Graceful shutdown
   * await manager.shutdownAll();
   * console.log('All pools shut down');
   * ```
   */
  async shutdownAll(): Promise<void> {
    logger.info('Shutting down all worker pools', {
      count: this.pools.size,
    });

    const shutdownPromises = Array.from(this.pools.values()).map(pool =>
      pool.shutdown()
    );

    await Promise.all(shutdownPromises);

    this.pools.clear();

    logger.info('All worker pools shut down successfully');
  }

  /**
   * Gets the total number of pools.
   *
   * @returns Number of active pools
   *
   * @example
   * ```typescript
   * console.log(`Managing ${manager.size} pools`);
   * ```
   */
  get size(): number {
    return this.pools.size;
  }

  /**
   * Checks if the manager has any pools.
   *
   * @returns True if manager has at least one pool
   *
   * @example
   * ```typescript
   * if (!manager.isEmpty) {
   *   // Has pools
   * }
   * ```
   */
  get isEmpty(): boolean {
    return this.pools.size === 0;
  }
}
