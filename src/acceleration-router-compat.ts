/**
 * @file acceleration-router-compat.ts
 * @description Backward compatibility layer for acceleration router
 *
 * This module provides deprecated function exports for backward compatibility.
 * New code should use the AccelerationRouter class directly.
 *
 * @deprecated This entire module is deprecated. Use AccelerationRouter class instead.
 * @module acceleration-router-compat
 * @since 3.3.0
 */

import { AccelerationRouter, AccelerationTier } from './acceleration-router.js';
import {
  matrixDeterminant as wasmMatrixDeterminant,
  statsMedian as wasmStatsMedian,
  statsStd as wasmStatsStd,
  statsVariance as wasmStatsVariance,
  statsMin as wasmStatsMin,
  statsMax as wasmStatsMax,
  statsSum as wasmStatsSum,
  statsMode as wasmStatsMode,
} from './wasm-wrapper.js';

// Default router instance
const defaultRouter = new AccelerationRouter();
let _initialized = false;

async function ensureInitialized(): Promise<void> {
  if (!_initialized) {
    await defaultRouter.initialize();
    _initialized = true;
  }
}

/** @deprecated Use AccelerationRouter.matrixMultiply() */
export async function routedMatrixMultiply(
  a: number[][], b: number[][], signal?: AbortSignal
): Promise<{ result: number[][]; tier: AccelerationTier }> {
  await ensureInitialized();
  return defaultRouter.matrixMultiply(a, b, signal);
}

/** @deprecated Use AccelerationRouter.matrixTranspose() */
export async function routedMatrixTranspose(
  matrix: number[][], signal?: AbortSignal
): Promise<{ result: number[][]; tier: AccelerationTier }> {
  await ensureInitialized();
  return defaultRouter.matrixTranspose(matrix, signal);
}

/** @deprecated Use AccelerationRouter.matrixAdd() */
export async function routedMatrixAdd(
  a: number[][], b: number[][], signal?: AbortSignal
): Promise<{ result: number[][]; tier: AccelerationTier }> {
  await ensureInitialized();
  return defaultRouter.matrixAdd(a, b, signal);
}

/** @deprecated Use AccelerationRouter.matrixSubtract() */
export async function routedMatrixSubtract(
  a: number[][], b: number[][], signal?: AbortSignal
): Promise<{ result: number[][]; tier: AccelerationTier }> {
  await ensureInitialized();
  return defaultRouter.matrixSubtract(a, b, signal);
}

/** @deprecated Use AccelerationRouter.statsMean() */
export async function routedStatsMean(
  data: number[], signal?: AbortSignal
): Promise<{ result: number; tier: AccelerationTier }> {
  await ensureInitialized();
  return defaultRouter.statsMean(data, signal);
}

/** @deprecated Use AccelerationRouter.getRoutingStats() */
export function getRoutingStats(): ReturnType<AccelerationRouter['getRoutingStats']> {
  return defaultRouter.getRoutingStats();
}

/** @deprecated Use AccelerationRouter.resetRoutingStats() */
export function resetRoutingStats(): void {
  defaultRouter.resetRoutingStats();
}

/** @deprecated Use AccelerationRouter.shutdown() */
export async function shutdownAcceleration(): Promise<void> {
  await defaultRouter.shutdown();
  _initialized = false;
}

// Direct re-exports for WASM-only functions
export const routedMatrixDeterminant = wasmMatrixDeterminant;
export const routedStatsMedian = wasmStatsMedian;
export const routedStatsStd = wasmStatsStd;
export const routedStatsVariance = wasmStatsVariance;
export const routedStatsMin = wasmStatsMin;
export const routedStatsMax = wasmStatsMax;
export const routedStatsSum = wasmStatsSum;
export const routedStatsMode = wasmStatsMode;
