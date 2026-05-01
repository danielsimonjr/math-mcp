/**
 * @file acceleration-adapter.ts
 * @description Adapter that implements AccelerationWrapper interface using the acceleration router
 *
 * This adapter provides a simple interface for tool-handlers to use the intelligent
 * acceleration routing system. It unwraps the {result, tier} tuples returned by
 * the router and returns just the results.
 *
 * @module acceleration-adapter
 * @since 3.0.0
 */

import {
  routedMatrixMultiply,
  routedMatrixDeterminant,
  routedMatrixTranspose,
  routedMatrixAdd,
  routedMatrixSubtract,
  routedStatsMean,
  routedStatsMedian,
  routedStatsStd,
  routedStatsVariance,
  routedStatsMin,
  routedStatsMax,
  routedStatsSum,
  routedStatsMode,
} from './acceleration-router-compat.js';
import type { AccelerationWrapper } from './types.js';

/**
 * Acceleration adapter that implements the AccelerationWrapper interface.
 *
 * This adapter routes operations through the intelligent acceleration system
 * (mathjs → WASM → WebWorkers → WebGPU) and returns just the results.
 *
 * @class AccelerationAdapter
 * @implements {AccelerationWrapper}
 */
export class AccelerationAdapter implements AccelerationWrapper {
  async matrixMultiply(a: number[][], b: number[][], signal?: AbortSignal): Promise<number[][]> {
    const { result } = await routedMatrixMultiply(a, b, signal);
    return result;
  }

  // Note: WASM-only ops below ignore `signal` — they run synchronous WASM
  // code inside the main thread and aren't bound to a worker slot, so
  // there's nothing to cancel. Accepting `signal` keeps the interface
  // uniform.
  async matrixDeterminant(matrix: number[][], _signal?: AbortSignal): Promise<number> {
    return await routedMatrixDeterminant(matrix);
  }

  async matrixTranspose(matrix: number[][], signal?: AbortSignal): Promise<number[][]> {
    const { result } = await routedMatrixTranspose(matrix, signal);
    return result;
  }

  async matrixAdd(a: number[][], b: number[][], signal?: AbortSignal): Promise<number[][]> {
    const { result } = await routedMatrixAdd(a, b, signal);
    return result;
  }

  async matrixSubtract(a: number[][], b: number[][], signal?: AbortSignal): Promise<number[][]> {
    const { result } = await routedMatrixSubtract(a, b, signal);
    return result;
  }

  async statsMean(data: number[], signal?: AbortSignal): Promise<number> {
    const { result } = await routedStatsMean(data, signal);
    return result;
  }

  async statsMedian(data: number[], _signal?: AbortSignal): Promise<number> {
    return await routedStatsMedian(data);
  }

  async statsMode(data: number[], _signal?: AbortSignal): Promise<number[]> {
    const result = await routedStatsMode(data);
    // Normalize to always return an array for consistency
    return Array.isArray(result) ? result : [result];
  }

  async statsStd(data: number[], _signal?: AbortSignal): Promise<number> {
    return await routedStatsStd(data);
  }

  async statsVariance(data: number[], _signal?: AbortSignal): Promise<number> {
    return await routedStatsVariance(data);
  }

  async statsMin(data: number[], _signal?: AbortSignal): Promise<number> {
    return await routedStatsMin(data);
  }

  async statsMax(data: number[], _signal?: AbortSignal): Promise<number> {
    return await routedStatsMax(data);
  }

  async statsSum(data: number[], _signal?: AbortSignal): Promise<number> {
    return await routedStatsSum(data);
  }
}

/**
 * Default acceleration adapter instance.
 * Export a singleton for convenience.
 */
export const accelerationAdapter = new AccelerationAdapter();
