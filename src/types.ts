/**
 * @file types.ts
 * @description Cross-layer interface definitions.
 *
 * Holds interfaces that need to be referenced from multiple layers
 * (handlers, adapters, routers) without creating downward dependencies.
 *
 * @module types
 */

/**
 * Acceleration wrapper for WASM/Workers/GPU operations.
 *
 * Implemented by `AccelerationAdapter` and consumed by tool handlers.
 * Defined here (rather than alongside the handlers) so the adapter
 * can implement the interface without importing from a higher layer.
 *
 * The optional `signal` parameter on each method is an `AbortSignal`
 * that, when aborted, cancels any in-flight worker tasks the operation
 * dispatched. Tool handlers wire this through `withTimeout`'s `abortFn`
 * callback so a timed-out operation immediately frees its worker slot
 * (DoS protection — without abort the worker keeps consuming CPU).
 */
export interface AccelerationWrapper {
  matrixMultiply: (a: number[][], b: number[][], signal?: AbortSignal) => Promise<number[][]>;
  matrixDeterminant: (matrix: number[][], signal?: AbortSignal) => Promise<number>;
  matrixTranspose: (matrix: number[][], signal?: AbortSignal) => Promise<number[][]>;
  matrixAdd: (a: number[][], b: number[][], signal?: AbortSignal) => Promise<number[][]>;
  matrixSubtract: (a: number[][], b: number[][], signal?: AbortSignal) => Promise<number[][]>;
  statsMean: (data: number[], signal?: AbortSignal) => Promise<number>;
  statsMedian: (data: number[], signal?: AbortSignal) => Promise<number>;
  statsMode: (data: number[], signal?: AbortSignal) => Promise<number[]>;
  statsStd: (data: number[], signal?: AbortSignal) => Promise<number>;
  statsVariance: (data: number[], signal?: AbortSignal) => Promise<number>;
  statsMin: (data: number[], signal?: AbortSignal) => Promise<number>;
  statsMax: (data: number[], signal?: AbortSignal) => Promise<number>;
  statsSum: (data: number[], signal?: AbortSignal) => Promise<number>;
}
