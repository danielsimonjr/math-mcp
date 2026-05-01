/**
 * @file acceleration-adapter.test.ts
 * @description Unit tests for AccelerationAdapter (the bridge between
 * tool-handlers and the routed acceleration API).
 *
 * The adapter's job is mechanical: unwrap {result, tier} tuples returned
 * by the router-compat layer and return just the result. These tests use
 * mocked compat functions so no real WASM / Worker / mathjs code runs.
 *
 * Why this matters: every accelerated tool call passes through this
 * class. A regression in unwrapping would silently start returning
 * `undefined` to handlers, masquerading as missing implementations.
 *
 * @since 3.5.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the compat module BEFORE importing the adapter so the adapter
// picks up the mocked functions when its module-level imports resolve.
vi.mock('../../src/acceleration-router-compat.js', () => ({
  routedMatrixMultiply: vi.fn(),
  routedMatrixDeterminant: vi.fn(),
  routedMatrixTranspose: vi.fn(),
  routedMatrixAdd: vi.fn(),
  routedMatrixSubtract: vi.fn(),
  routedStatsMean: vi.fn(),
  routedStatsMedian: vi.fn(),
  routedStatsStd: vi.fn(),
  routedStatsVariance: vi.fn(),
  routedStatsMin: vi.fn(),
  routedStatsMax: vi.fn(),
  routedStatsSum: vi.fn(),
  routedStatsMode: vi.fn(),
}));

import { AccelerationAdapter, accelerationAdapter } from '../../src/acceleration-adapter.js';
import * as compat from '../../src/acceleration-router-compat.js';
import { AccelerationTier } from '../../src/degradation-policy.js';

const mocked = compat as unknown as Record<string, ReturnType<typeof vi.fn>>;

describe('AccelerationAdapter', () => {
  let adapter: AccelerationAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new AccelerationAdapter();
  });

  describe('matrix operations — unwrap {result, tier}', () => {
    it('matrixMultiply returns just the result', async () => {
      mocked.routedMatrixMultiply.mockResolvedValueOnce({
        result: [[1, 2], [3, 4]],
        tier: AccelerationTier.WASM,
      });
      const r = await adapter.matrixMultiply([[1, 0], [0, 1]], [[1, 2], [3, 4]]);
      expect(r).toEqual([[1, 2], [3, 4]]);
      // The adapter forwards an optional signal arg (undefined here when
      // no AbortSignal is passed) — DoS-protection abort wiring added in
      // 3.5.x. Match either form.
      const call = mocked.routedMatrixMultiply.mock.calls[0];
      expect(call[0]).toEqual([[1, 0], [0, 1]]);
      expect(call[1]).toEqual([[1, 2], [3, 4]]);
    });

    it('matrixTranspose unwraps the result', async () => {
      mocked.routedMatrixTranspose.mockResolvedValueOnce({
        result: [[1, 3], [2, 4]],
        tier: AccelerationTier.MATHJS,
      });
      const r = await adapter.matrixTranspose([[1, 2], [3, 4]]);
      expect(r).toEqual([[1, 3], [2, 4]]);
    });

    it('matrixAdd unwraps the result', async () => {
      mocked.routedMatrixAdd.mockResolvedValueOnce({
        result: [[2]],
        tier: AccelerationTier.MATHJS,
      });
      expect(await adapter.matrixAdd([[1]], [[1]])).toEqual([[2]]);
    });

    it('matrixSubtract unwraps the result', async () => {
      mocked.routedMatrixSubtract.mockResolvedValueOnce({
        result: [[0]],
        tier: AccelerationTier.MATHJS,
      });
      expect(await adapter.matrixSubtract([[1]], [[1]])).toEqual([[0]]);
    });
  });

  describe('matrix operations — direct return (no unwrap)', () => {
    it('matrixDeterminant returns the value directly', async () => {
      mocked.routedMatrixDeterminant.mockResolvedValueOnce(-2);
      expect(await adapter.matrixDeterminant([[1, 2], [3, 4]])).toBe(-2);
    });
  });

  describe('statistics operations', () => {
    it('statsMean unwraps {result, tier}', async () => {
      mocked.routedStatsMean.mockResolvedValueOnce({
        result: 3,
        tier: AccelerationTier.WORKERS,
      });
      expect(await adapter.statsMean([1, 2, 3, 4, 5])).toBe(3);
    });

    it('statsMedian returns directly (no wrapper)', async () => {
      mocked.routedStatsMedian.mockResolvedValueOnce(3);
      expect(await adapter.statsMedian([1, 2, 3, 4, 5])).toBe(3);
    });

    it('statsStd / Variance / Min / Max / Sum return directly', async () => {
      mocked.routedStatsStd.mockResolvedValueOnce(1.5);
      mocked.routedStatsVariance.mockResolvedValueOnce(2.25);
      mocked.routedStatsMin.mockResolvedValueOnce(1);
      mocked.routedStatsMax.mockResolvedValueOnce(5);
      mocked.routedStatsSum.mockResolvedValueOnce(15);
      const data = [1, 2, 3, 4, 5];
      expect(await adapter.statsStd(data)).toBe(1.5);
      expect(await adapter.statsVariance(data)).toBe(2.25);
      expect(await adapter.statsMin(data)).toBe(1);
      expect(await adapter.statsMax(data)).toBe(5);
      expect(await adapter.statsSum(data)).toBe(15);
    });

    describe('statsMode normalization', () => {
      it('wraps a scalar mode result into an array', async () => {
        mocked.routedStatsMode.mockResolvedValueOnce(7);
        expect(await adapter.statsMode([7, 7, 7])).toEqual([7]);
      });

      it('passes through an array result unchanged', async () => {
        mocked.routedStatsMode.mockResolvedValueOnce([1, 3]);
        expect(await adapter.statsMode([1, 1, 3, 3])).toEqual([1, 3]);
      });

      it('wraps a single-element-but-already-array result correctly', async () => {
        mocked.routedStatsMode.mockResolvedValueOnce([5]);
        expect(await adapter.statsMode([5, 5, 5])).toEqual([5]);
      });
    });
  });

  describe('error propagation', () => {
    it('propagates errors from the underlying compat function', async () => {
      const err = new Error('worker crashed');
      mocked.routedMatrixMultiply.mockRejectedValueOnce(err);
      await expect(
        adapter.matrixMultiply([[1]], [[1]])
      ).rejects.toBe(err);
    });
  });

  describe('singleton', () => {
    it('exports a default accelerationAdapter instance', () => {
      expect(accelerationAdapter).toBeInstanceOf(AccelerationAdapter);
    });
  });
});
