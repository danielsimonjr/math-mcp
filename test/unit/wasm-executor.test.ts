/**
 * @file wasm-executor.test.ts
 * @description Unit tests for executeUnaryOp / executeBinaryOp.
 *
 * wasm-executor is the per-op routing primitive that decides WASM vs
 * mathjs based on size + readiness + optional extra checks, and falls
 * back to mathjs on any WASM failure. Every wasm-wrapper.ts function
 * funnels through it. Tests use synthetic wasmFn/mathjsFn so no real
 * WASM is loaded.
 *
 * @since 3.5.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  executeUnaryOp,
  executeBinaryOp,
  recordPerf,
  resetPerfCounters,
  getPerfStats,
  type UnaryOperationConfig,
  type BinaryOperationConfig,
} from '../../src/wasm-executor.js';

describe('wasm-executor', () => {
  beforeEach(() => {
    resetPerfCounters();
    vi.clearAllMocks();
  });

  describe('executeUnaryOp', () => {
    const baseConfig = (overrides: Partial<UnaryOperationConfig<number[], number>> = {}): UnaryOperationConfig<number[], number> => ({
      name: 'test-op',
      threshold: 10,
      getSize: (arr) => arr.length,
      wasmFn: vi.fn((arr: number[]) => arr.length * 2),
      mathjsFn: vi.fn((arr: number[]) => arr.length),
      ...overrides,
    });

    it('uses WASM when size >= threshold and wasmReady', async () => {
      const config = baseConfig();
      const input = new Array(15).fill(0);
      const r = await executeUnaryOp(config, input, true);
      expect(r).toBe(30);
      expect(config.wasmFn).toHaveBeenCalledOnce();
      expect(config.mathjsFn).not.toHaveBeenCalled();
    });

    it('falls back to mathjs when size < threshold', async () => {
      const config = baseConfig();
      const input = new Array(5).fill(0);
      const r = await executeUnaryOp(config, input, true);
      expect(r).toBe(5);
      expect(config.wasmFn).not.toHaveBeenCalled();
      expect(config.mathjsFn).toHaveBeenCalledOnce();
    });

    it('falls back to mathjs when wasmReady=false (regardless of size)', async () => {
      const config = baseConfig();
      const r = await executeUnaryOp(config, new Array(100).fill(0), false);
      expect(r).toBe(100);
      expect(config.wasmFn).not.toHaveBeenCalled();
      expect(config.mathjsFn).toHaveBeenCalledOnce();
    });

    it('respects extraCheck — skips WASM if extraCheck returns false', async () => {
      const extraCheck = vi.fn((arr: number[]) => arr.length % 2 === 0);
      const config = baseConfig({ extraCheck });
      const r = await executeUnaryOp(config, new Array(15).fill(0), true);
      expect(r).toBe(15); // mathjs path
      expect(config.wasmFn).not.toHaveBeenCalled();
      expect(extraCheck).toHaveBeenCalledOnce();
    });

    it('uses WASM when extraCheck returns true', async () => {
      const config = baseConfig({ extraCheck: () => true });
      const r = await executeUnaryOp(config, new Array(15).fill(0), true);
      expect(r).toBe(30); // wasm path
    });

    it('falls back to mathjs when wasmFn throws', async () => {
      const wasmFn = vi.fn(() => { throw new Error('wasm boom'); });
      const mathjsFn = vi.fn((arr: number[]) => arr.length);
      const config: UnaryOperationConfig<number[], number> = {
        name: 'op',
        threshold: 1,
        getSize: (arr) => arr.length,
        wasmFn,
        mathjsFn,
      };
      const r = await executeUnaryOp(config, [1, 2, 3], true);
      expect(r).toBe(3);
      expect(wasmFn).toHaveBeenCalledOnce();
      expect(mathjsFn).toHaveBeenCalledOnce();
    });
  });

  describe('executeBinaryOp', () => {
    const baseBinary = (overrides: Partial<BinaryOperationConfig<number[], number[], number>> = {}): BinaryOperationConfig<number[], number[], number> => ({
      name: 'binary-op',
      threshold: 5,
      getSize: (a, _b) => a.length,
      wasmFn: vi.fn((a, b) => a.length + b.length + 100),
      mathjsFn: vi.fn((a, b) => a.length + b.length),
      ...overrides,
    });

    it('uses WASM when size >= threshold', async () => {
      const config = baseBinary();
      const r = await executeBinaryOp(config, new Array(10).fill(0), new Array(10).fill(0), true);
      expect(r).toBe(120);
      expect(config.wasmFn).toHaveBeenCalledOnce();
    });

    it('falls back to mathjs when binary extraCheck rejects', async () => {
      const extraCheck = vi.fn((a: number[], b: number[]) => a.length === b.length);
      const config = baseBinary({ extraCheck });
      const r = await executeBinaryOp(config, new Array(10).fill(0), new Array(20).fill(0), true);
      expect(r).toBe(30);
      expect(config.wasmFn).not.toHaveBeenCalled();
    });

    it('falls back to mathjs when binary wasmFn throws', async () => {
      const config = baseBinary({
        wasmFn: vi.fn(() => { throw new Error('binary boom'); }),
      });
      const r = await executeBinaryOp(config, [1, 2, 3, 4, 5], [1, 2, 3, 4, 5], true);
      expect(r).toBe(10);
    });
  });

  describe('perf counters', () => {
    it('records WASM and mathjs calls separately', () => {
      recordPerf('wasm', 5);
      recordPerf('wasm', 3);
      recordPerf('mathjs', 1);
      const stats = getPerfStats();
      expect(stats.wasmCalls).toBe(2);
      expect(stats.mathjsCalls).toBe(1);
      expect(stats.totalCalls).toBe(3);
    });

    it('reports wasmPercentage with one decimal', () => {
      recordPerf('wasm', 1);
      recordPerf('wasm', 1);
      recordPerf('wasm', 1);
      recordPerf('mathjs', 1);
      expect(getPerfStats().wasmPercentage).toBe('75.0%');
    });

    it('handles zero calls without dividing by zero', () => {
      const stats = getPerfStats();
      expect(stats.totalCalls).toBe(0);
      expect(stats.wasmPercentage).toBe('0.0%');
      expect(stats.avgWasmTime).toBe('0.000ms');
      expect(stats.avgMathjsTime).toBe('0.000ms');
    });

    it('resetPerfCounters zeroes everything', () => {
      recordPerf('wasm', 5);
      recordPerf('mathjs', 5);
      resetPerfCounters();
      const stats = getPerfStats();
      expect(stats.wasmCalls).toBe(0);
      expect(stats.mathjsCalls).toBe(0);
      expect(stats.totalCalls).toBe(0);
    });
  });
});
