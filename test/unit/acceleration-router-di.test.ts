/**
 * @file acceleration-router-di.test.ts
 * @description Unit tests for AccelerationRouter dependency injection
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AccelerationRouter } from '../../src/acceleration-router.js';
import { WorkerPool } from '../../src/workers/worker-pool.js';

describe('AccelerationRouter - Dependency Injection', () => {
  let router: AccelerationRouter;

  afterEach(async () => {
    if (router) {
      await router.shutdown();
    }
  });

  describe('constructor', () => {
    it('should create router with default configuration', () => {
      router = new AccelerationRouter();

      expect(router).toBeDefined();
      expect(router.getRoutingStats().totalOps).toBe(0);
    });

    it('should create router with custom configuration', () => {
      router = new AccelerationRouter({
        enableWorkers: false,
        workerPoolConfig: {
          maxWorkers: 4,
          minWorkers: 1,
        },
      });

      expect(router).toBeDefined();
    });

    it('should accept injected worker pool', async () => {
      const pool = new WorkerPool({ maxWorkers: 2, minWorkers: 1 });
      await pool.initialize();

      router = new AccelerationRouter({}, pool);

      expect(router).toBeDefined();

      // Cleanup injected pool manually
      await pool.shutdown();
    });
  });

  describe('initialize', () => {
    it('should initialize successfully with workers enabled', async () => {
      router = new AccelerationRouter({ enableWorkers: true });

      await expect(router.initialize()).resolves.not.toThrow();
    });

    it('should skip initialization if pool was injected', async () => {
      const pool = new WorkerPool({ maxWorkers: 2 });
      await pool.initialize();

      router = new AccelerationRouter({}, pool);

      // Should not throw, and should be a no-op
      await expect(router.initialize()).resolves.not.toThrow();

      await pool.shutdown();
    });

    it('should skip initialization if workers disabled', async () => {
      router = new AccelerationRouter({ enableWorkers: false });

      await expect(router.initialize()).resolves.not.toThrow();
    });

    it('should handle initialization failure gracefully', async () => {
      router = new AccelerationRouter({
        workerPoolConfig: {
          maxWorkers: 100000, // Unrealistic number
          minWorkers: 1,
        },
      });

      // Should not throw even if pool creation fails
      await expect(router.initialize()).resolves.not.toThrow();
    });
  });

  describe('shutdown', () => {
    it('should shutdown cleanly', async () => {
      router = new AccelerationRouter();
      await router.initialize();

      await expect(router.shutdown()).resolves.not.toThrow();
    });

    it('should handle multiple shutdown calls', async () => {
      router = new AccelerationRouter();
      await router.initialize();

      await router.shutdown();
      await expect(router.shutdown()).resolves.not.toThrow();
    });

    it('should not shutdown injected pool', async () => {
      const pool = new WorkerPool({ maxWorkers: 2 });
      await pool.initialize();

      router = new AccelerationRouter({}, pool);
      await router.initialize();

      // Router should not shutdown the injected pool
      await router.shutdown();

      // Pool should still be functional
      const stats = pool.getStats();
      expect(stats.totalWorkers).toBeGreaterThan(0);

      await pool.shutdown();
    });
  });

  describe('matrix operations', () => {
    beforeEach(async () => {
      router = new AccelerationRouter({ enableWorkers: false });
      await router.initialize();
    });

    it('should perform matrix multiplication', async () => {
      const a = [[1, 2], [3, 4]];
      const b = [[5, 6], [7, 8]];

      const { result, tier } = await router.matrixMultiply(a, b);

      expect(result).toBeDefined();
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveLength(2);
      expect(tier).toBeDefined();
    });

    it('should perform matrix transpose', async () => {
      const matrix = [[1, 2, 3], [4, 5, 6]];

      const { result, tier } = await router.matrixTranspose(matrix);

      expect(result).toEqual([[1, 4], [2, 5], [3, 6]]);
      expect(tier).toBeDefined();
    });

    it('should perform matrix addition', async () => {
      const a = [[1, 2], [3, 4]];
      const b = [[5, 6], [7, 8]];

      const { result, tier } = await router.matrixAdd(a, b);

      expect(result).toEqual([[6, 8], [10, 12]]);
      expect(tier).toBeDefined();
    });

    it('should perform matrix subtraction', async () => {
      const a = [[5, 6], [7, 8]];
      const b = [[1, 2], [3, 4]];

      const { result, tier } = await router.matrixSubtract(a, b);

      expect(result).toEqual([[4, 4], [4, 4]]);
      expect(tier).toBeDefined();
    });

    it('should calculate matrix determinant', async () => {
      const matrix = [[1, 2], [3, 4]];

      const result = await router.matrixDeterminant(matrix);

      expect(result).toBeCloseTo(-2, 5);
    });
  });

  describe('statistics operations', () => {
    beforeEach(async () => {
      router = new AccelerationRouter({ enableWorkers: false });
      await router.initialize();
    });

    it('should calculate mean', async () => {
      const data = [1, 2, 3, 4, 5];

      const { result, tier } = await router.statsMean(data);

      expect(result).toBeCloseTo(3, 5);
      expect(tier).toBeDefined();
    });

    it('should calculate median', async () => {
      const data = [1, 2, 3, 4, 5];

      const result = await router.statsMedian(data);

      expect(result).toBeCloseTo(3, 5);
    });

    it('should calculate standard deviation', async () => {
      const data = [2, 4, 4, 4, 5, 5, 7, 9];

      const result = await router.statsStd(data);

      expect(result).toBeGreaterThan(0);
    });

    it('should calculate variance', async () => {
      const data = [2, 4, 4, 4, 5, 5, 7, 9];

      const result = await router.statsVariance(data);

      expect(result).toBeGreaterThan(0);
    });

    it('should find minimum', async () => {
      const data = [5, 2, 8, 1, 9];

      const result = await router.statsMin(data);

      expect(result).toBe(1);
    });

    it('should find maximum', async () => {
      const data = [5, 2, 8, 1, 9];

      const result = await router.statsMax(data);

      expect(result).toBe(9);
    });

    it('should calculate sum', async () => {
      const data = [1, 2, 3, 4, 5];

      const result = await router.statsSum(data);

      expect(result).toBe(15);
    });

    it('should calculate mode', async () => {
      const data = [1, 2, 2, 3, 4, 4, 4, 5];

      const result = await router.statsMode(data);

      // Mode can return single number or array of numbers
      if (Array.isArray(result)) {
        expect(result).toContain(4);
      } else {
        expect(result).toBe(4);
      }
    });
  });

  describe('routing statistics', () => {
    beforeEach(async () => {
      router = new AccelerationRouter({ enableWorkers: false });
      await router.initialize();
    });

    it('should track routing statistics', async () => {
      await router.matrixMultiply([[1, 2]], [[3], [4]]);
      await router.statsMean([1, 2, 3]);

      const stats = router.getRoutingStats();

      expect(stats.totalOps).toBeGreaterThan(0);
      expect(stats.accelerationRate).toBeDefined();
    });

    it('should reset routing statistics', async () => {
      await router.matrixMultiply([[1, 2]], [[3], [4]]);

      let stats = router.getRoutingStats();
      expect(stats.totalOps).toBeGreaterThan(0);

      router.resetRoutingStats();

      stats = router.getRoutingStats();
      expect(stats.totalOps).toBe(0);
      expect(stats.mathjsUsage).toBe(0);
      expect(stats.wasmUsage).toBe(0);
      expect(stats.workersUsage).toBe(0);
      expect(stats.gpuUsage).toBe(0);
    });

    it('should calculate acceleration rate correctly', async () => {
      // Small operation - should use mathjs
      await router.matrixMultiply([[1]], [[2]]);

      const stats = router.getRoutingStats();

      expect(stats.totalOps).toBe(1);
      expect(stats.accelerationRate).toBeDefined();
    });
  });

  describe('multiple router instances', () => {
    it('should support multiple independent routers', async () => {
      const router1 = new AccelerationRouter({ enableWorkers: false });
      const router2 = new AccelerationRouter({ enableWorkers: false });

      await router1.initialize();
      await router2.initialize();

      // Operations on router1
      await router1.statsMean([1, 2, 3]);

      // Operations on router2
      await router2.matrixMultiply([[1, 2]], [[3], [4]]);

      // Each router should have independent stats
      const stats1 = router1.getRoutingStats();
      const stats2 = router2.getRoutingStats();

      expect(stats1.totalOps).toBe(1);
      expect(stats2.totalOps).toBe(1);

      await router1.shutdown();
      await router2.shutdown();
    });

    it('should support routers with different configurations', async () => {
      const router1 = new AccelerationRouter({ enableWorkers: true });
      const router2 = new AccelerationRouter({ enableWorkers: false });

      await router1.initialize();
      await router2.initialize();

      // Both should work independently
      await expect(router1.statsMean([1, 2, 3])).resolves.toBeDefined();
      await expect(router2.statsMean([1, 2, 3])).resolves.toBeDefined();

      await router1.shutdown();
      await router2.shutdown();
    });
  });
});
