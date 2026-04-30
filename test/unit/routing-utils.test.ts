/**
 * @file routing-utils.test.ts
 * @description Unit tests for routeWithFallback and the routing-stats helpers.
 *
 * routing-utils is the generic engine that walks GPU → Workers → WASM → mathjs.
 * Every per-operation method on AccelerationRouter funnels through it,
 * so a regression here would silently mis-route every accelerated op.
 *
 * Tests use synthetic TierExecutors so no real WASM/Worker code runs.
 *
 * @since 3.5.0
 */

import { describe, it, expect } from 'vitest';
import {
  createRoutingStats,
  incrementUsage,
  computeRoutingStatsSummary,
  routeWithFallback,
  type TierExecutor,
} from '../../src/routing-utils.js';
import { AccelerationTier } from '../../src/degradation-policy.js';

const tier = (t: AccelerationTier, shouldUse: boolean, fn: () => Promise<number>): TierExecutor<number> => ({
  tier: t,
  shouldUse: () => shouldUse,
  execute: fn,
});

describe('routing-utils', () => {
  describe('createRoutingStats', () => {
    it('starts every counter at zero', () => {
      const stats = createRoutingStats();
      expect(stats).toEqual({ mathjsUsage: 0, wasmUsage: 0, workersUsage: 0, gpuUsage: 0 });
    });
  });

  describe('incrementUsage', () => {
    it('increments the right counter for each tier', () => {
      const s = createRoutingStats();
      incrementUsage(s, AccelerationTier.MATHJS);
      incrementUsage(s, AccelerationTier.WASM);
      incrementUsage(s, AccelerationTier.WASM);
      incrementUsage(s, AccelerationTier.WORKERS);
      incrementUsage(s, AccelerationTier.GPU);
      expect(s).toEqual({ mathjsUsage: 1, wasmUsage: 2, workersUsage: 1, gpuUsage: 1 });
    });
  });

  describe('computeRoutingStatsSummary', () => {
    it('reports 0% acceleration when all ops were mathjs', () => {
      const s = { mathjsUsage: 4, wasmUsage: 0, workersUsage: 0, gpuUsage: 0 };
      const r = computeRoutingStatsSummary(s);
      expect(r.totalOps).toBe(4);
      expect(r.accelerationRate).toBe('0.0%');
    });

    it('reports 100% when no mathjs fallback occurred', () => {
      const s = { mathjsUsage: 0, wasmUsage: 3, workersUsage: 5, gpuUsage: 2 };
      const r = computeRoutingStatsSummary(s);
      expect(r.totalOps).toBe(10);
      expect(r.accelerationRate).toBe('100.0%');
    });

    it('reports the boundary: zero ops → 0% (no division-by-zero)', () => {
      const r = computeRoutingStatsSummary(createRoutingStats());
      expect(r.totalOps).toBe(0);
      expect(r.accelerationRate).toBe('0%');
    });

    it('rounds to one decimal place', () => {
      const s = { mathjsUsage: 2, wasmUsage: 1, workersUsage: 0, gpuUsage: 0 };
      // 1/3 ≈ 33.333…%
      expect(computeRoutingStatsSummary(s).accelerationRate).toBe('33.3%');
    });
  });

  describe('routeWithFallback', () => {
    it('uses the first tier whose shouldUse() returns true', async () => {
      const stats = createRoutingStats();
      const tiers = [
        tier(AccelerationTier.GPU, false, async () => 1),
        tier(AccelerationTier.WORKERS, true, async () => 42),
        tier(AccelerationTier.WASM, true, async () => 99),
      ];
      const r = await routeWithFallback(
        { operation: 'test', size: 100, tiers, fallback: () => -1 },
        stats
      );
      expect(r.result).toBe(42);
      expect(r.tier).toBe(AccelerationTier.WORKERS);
      expect(stats.workersUsage).toBe(1);
      expect(stats.wasmUsage).toBe(0);
    });

    it('falls through to mathjs when no tier shouldUse', async () => {
      const stats = createRoutingStats();
      const tiers = [
        tier(AccelerationTier.GPU, false, async () => 1),
        tier(AccelerationTier.WORKERS, false, async () => 2),
        tier(AccelerationTier.WASM, false, async () => 3),
      ];
      const r = await routeWithFallback(
        { operation: 'test', size: 5, tiers, fallback: () => 999 },
        stats
      );
      expect(r.result).toBe(999);
      expect(r.tier).toBe(AccelerationTier.MATHJS);
      expect(stats.mathjsUsage).toBe(1);
    });

    it('cascades to the next tier when an upper tier throws', async () => {
      const stats = createRoutingStats();
      const tiers = [
        tier(AccelerationTier.WORKERS, true, async () => { throw new Error('worker died'); }),
        tier(AccelerationTier.WASM, true, async () => 7),
      ];
      const r = await routeWithFallback(
        { operation: 'test', size: 10, tiers, fallback: () => -1 },
        stats
      );
      expect(r.result).toBe(7);
      expect(r.tier).toBe(AccelerationTier.WASM);
      expect(stats.wasmUsage).toBe(1);
      expect(stats.workersUsage).toBe(0);
    });

    it('cascades all the way to mathjs when every tier throws', async () => {
      const stats = createRoutingStats();
      const tiers = [
        tier(AccelerationTier.WORKERS, true, async () => { throw new Error('w'); }),
        tier(AccelerationTier.WASM, true, async () => { throw new Error('a'); }),
      ];
      const r = await routeWithFallback(
        { operation: 'test', size: 10, tiers, fallback: () => 0 },
        stats
      );
      expect(r.result).toBe(0);
      expect(r.tier).toBe(AccelerationTier.MATHJS);
      expect(stats.mathjsUsage).toBe(1);
    });

    it('supports a synchronous fallback', async () => {
      const stats = createRoutingStats();
      const r = await routeWithFallback(
        { operation: 'test', size: 1, tiers: [], fallback: () => 'sync-result' as unknown as number },
        stats
      );
      expect(r.result).toBe('sync-result');
      expect(r.tier).toBe(AccelerationTier.MATHJS);
    });

    it('supports an async fallback', async () => {
      const stats = createRoutingStats();
      const r = await routeWithFallback(
        { operation: 'test', size: 1, tiers: [], fallback: async () => 11 },
        stats
      );
      expect(r.result).toBe(11);
    });
  });
});
