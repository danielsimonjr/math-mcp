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
} from './acceleration-router.js';
import type { AccelerationWrapper } from './tool-handlers.js';

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
  async matrixMultiply(a: number[][], b: number[][]): Promise<number[][]> {
    const { result } = await routedMatrixMultiply(a, b);
    return result;
  }

  async matrixDeterminant(matrix: number[][]): Promise<number> {
    return await routedMatrixDeterminant(matrix);
  }

  async matrixTranspose(matrix: number[][]): Promise<number[][]> {
    const { result } = await routedMatrixTranspose(matrix);
    return result;
  }

  async matrixAdd(a: number[][], b: number[][]): Promise<number[][]> {
    const { result } = await routedMatrixAdd(a, b);
    return result;
  }

  async matrixSubtract(a: number[][], b: number[][]): Promise<number[][]> {
    const { result } = await routedMatrixSubtract(a, b);
    return result;
  }

  async statsMean(data: number[]): Promise<number> {
    const { result } = await routedStatsMean(data);
    return result;
  }

  async statsMedian(data: number[]): Promise<number> {
    return await routedStatsMedian(data);
  }

  async statsMode(data: number[]): Promise<number[]> {
    const result = await routedStatsMode(data);
    // Normalize to always return an array for consistency
    return Array.isArray(result) ? result : [result];
  }

  async statsStd(data: number[]): Promise<number> {
    return await routedStatsStd(data);
  }

  async statsVariance(data: number[]): Promise<number> {
    return await routedStatsVariance(data);
  }

  async statsMin(data: number[]): Promise<number> {
    return await routedStatsMin(data);
  }

  async statsMax(data: number[]): Promise<number> {
    return await routedStatsMax(data);
  }

  async statsSum(data: number[]): Promise<number> {
    return await routedStatsSum(data);
  }
}

/**
 * Default acceleration adapter instance.
 * Export a singleton for convenience.
 */
export const accelerationAdapter = new AccelerationAdapter();
