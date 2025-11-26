/**
 * @file pool-manager.test.ts
 * @description Unit tests for WorkerPoolManager
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WorkerPoolManager } from '../../../src/workers/pool-manager.js';
import type { WorkerPoolConfig } from '../../../src/workers/worker-types.js';

describe('WorkerPoolManager', () => {
  let manager: WorkerPoolManager;

  beforeEach(() => {
    manager = new WorkerPoolManager();
  });

  afterEach(async () => {
    await manager.shutdownAll();
  });

  describe('createPool', () => {
    it('should create a new pool with valid configuration', async () => {
      const config: WorkerPoolConfig = {
        maxWorkers: 2,
        minWorkers: 1,
        taskTimeout: 5000,
      };

      const pool = await manager.createPool('test-pool', config);

      expect(pool).toBeDefined();
      expect(manager.size).toBe(1);
      expect(manager.hasPool('test-pool')).toBe(true);
    });

    it('should throw error if pool name already exists', async () => {
      const config: WorkerPoolConfig = {
        maxWorkers: 2,
      };

      await manager.createPool('test-pool', config);

      await expect(
        manager.createPool('test-pool', config)
      ).rejects.toThrow("Worker pool 'test-pool' already exists");
    });

    it('should create multiple pools with different names', async () => {
      const config: WorkerPoolConfig = { maxWorkers: 2 };

      await manager.createPool('pool-1', config);
      await manager.createPool('pool-2', config);
      await manager.createPool('pool-3', config);

      expect(manager.size).toBe(3);
      expect(manager.getPoolNames()).toEqual(['pool-1', 'pool-2', 'pool-3']);
    });

    it('should initialize created pool', async () => {
      const config: WorkerPoolConfig = {
        maxWorkers: 2,
        minWorkers: 1,
      };

      const pool = await manager.createPool('test-pool', config);
      const stats = pool.getStats();

      expect(stats.totalWorkers).toBeGreaterThanOrEqual(1);
      expect(stats.totalWorkers).toBeLessThanOrEqual(2);
    });
  });

  describe('getPool', () => {
    it('should return existing pool', async () => {
      const config: WorkerPoolConfig = { maxWorkers: 2 };
      const created = await manager.createPool('test-pool', config);

      const retrieved = manager.getPool('test-pool');

      expect(retrieved).toBe(created);
    });

    it('should return undefined for non-existent pool', () => {
      const pool = manager.getPool('non-existent');

      expect(pool).toBeUndefined();
    });
  });

  describe('hasPool', () => {
    it('should return true for existing pool', async () => {
      const config: WorkerPoolConfig = { maxWorkers: 2 };
      await manager.createPool('test-pool', config);

      expect(manager.hasPool('test-pool')).toBe(true);
    });

    it('should return false for non-existent pool', () => {
      expect(manager.hasPool('non-existent')).toBe(false);
    });
  });

  describe('getPoolNames', () => {
    it('should return empty array when no pools exist', () => {
      expect(manager.getPoolNames()).toEqual([]);
    });

    it('should return all pool names', async () => {
      const config: WorkerPoolConfig = { maxWorkers: 2 };

      await manager.createPool('alpha', config);
      await manager.createPool('beta', config);
      await manager.createPool('gamma', config);

      const names = manager.getPoolNames();

      expect(names).toHaveLength(3);
      expect(names).toContain('alpha');
      expect(names).toContain('beta');
      expect(names).toContain('gamma');
    });
  });

  describe('getAllStats', () => {
    it('should return empty map when no pools exist', () => {
      const stats = manager.getAllStats();

      expect(stats.size).toBe(0);
    });

    it('should return stats for all pools', async () => {
      const config: WorkerPoolConfig = { maxWorkers: 2, minWorkers: 1 };

      await manager.createPool('pool-1', config);
      await manager.createPool('pool-2', config);

      const stats = manager.getAllStats();

      expect(stats.size).toBe(2);
      expect(stats.has('pool-1')).toBe(true);
      expect(stats.has('pool-2')).toBe(true);

      const pool1Stats = stats.get('pool-1')!;
      expect(pool1Stats.totalWorkers).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getAggregateStats', () => {
    it('should return zero stats when no pools exist', () => {
      const aggregate = manager.getAggregateStats();

      expect(aggregate.totalPools).toBe(0);
      expect(aggregate.totalWorkers).toBe(0);
      expect(aggregate.idleWorkers).toBe(0);
      expect(aggregate.busyWorkers).toBe(0);
      expect(aggregate.queueSize).toBe(0);
      expect(aggregate.tasksCompleted).toBe(0);
      expect(aggregate.tasksFailed).toBe(0);
      expect(aggregate.avgExecutionTime).toBe(0);
    });

    it('should aggregate stats across multiple pools', async () => {
      const config: WorkerPoolConfig = {
        maxWorkers: 2,
        minWorkers: 1,
      };

      await manager.createPool('pool-1', config);
      await manager.createPool('pool-2', config);
      await manager.createPool('pool-3', config);

      const aggregate = manager.getAggregateStats();

      expect(aggregate.totalPools).toBe(3);
      expect(aggregate.totalWorkers).toBeGreaterThanOrEqual(3); // At least minWorkers * 3
      expect(aggregate.idleWorkers).toBeGreaterThanOrEqual(0);
    });
  });

  describe('removePool', () => {
    it('should remove and shutdown existing pool', async () => {
      const config: WorkerPoolConfig = { maxWorkers: 2 };
      await manager.createPool('test-pool', config);

      const removed = await manager.removePool('test-pool');

      expect(removed).toBe(true);
      expect(manager.size).toBe(0);
      expect(manager.hasPool('test-pool')).toBe(false);
    });

    it('should return false for non-existent pool', async () => {
      const removed = await manager.removePool('non-existent');

      expect(removed).toBe(false);
    });

    it('should only remove specified pool', async () => {
      const config: WorkerPoolConfig = { maxWorkers: 2 };

      await manager.createPool('pool-1', config);
      await manager.createPool('pool-2', config);
      await manager.createPool('pool-3', config);

      await manager.removePool('pool-2');

      expect(manager.size).toBe(2);
      expect(manager.hasPool('pool-1')).toBe(true);
      expect(manager.hasPool('pool-2')).toBe(false);
      expect(manager.hasPool('pool-3')).toBe(true);
    });
  });

  describe('shutdownAll', () => {
    it('should shutdown all pools', async () => {
      const config: WorkerPoolConfig = { maxWorkers: 2 };

      await manager.createPool('pool-1', config);
      await manager.createPool('pool-2', config);
      await manager.createPool('pool-3', config);

      expect(manager.size).toBe(3);

      await manager.shutdownAll();

      expect(manager.size).toBe(0);
      expect(manager.isEmpty).toBe(true);
    });

    it('should handle empty manager gracefully', async () => {
      await expect(manager.shutdownAll()).resolves.not.toThrow();
    });
  });

  describe('size property', () => {
    it('should return 0 for new manager', () => {
      expect(manager.size).toBe(0);
    });

    it('should return correct count after adding pools', async () => {
      const config: WorkerPoolConfig = { maxWorkers: 2 };

      expect(manager.size).toBe(0);

      await manager.createPool('pool-1', config);
      expect(manager.size).toBe(1);

      await manager.createPool('pool-2', config);
      expect(manager.size).toBe(2);

      await manager.removePool('pool-1');
      expect(manager.size).toBe(1);
    });
  });

  describe('isEmpty property', () => {
    it('should return true for new manager', () => {
      expect(manager.isEmpty).toBe(true);
    });

    it('should return false when pools exist', async () => {
      const config: WorkerPoolConfig = { maxWorkers: 2 };

      await manager.createPool('test-pool', config);

      expect(manager.isEmpty).toBe(false);
    });

    it('should return true after removing all pools', async () => {
      const config: WorkerPoolConfig = { maxWorkers: 2 };

      await manager.createPool('test-pool', config);
      expect(manager.isEmpty).toBe(false);

      await manager.removePool('test-pool');
      expect(manager.isEmpty).toBe(true);
    });
  });
});
