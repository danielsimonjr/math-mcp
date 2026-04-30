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
 */
export interface AccelerationWrapper {
  matrixMultiply: (a: number[][], b: number[][]) => Promise<number[][]>;
  matrixDeterminant: (matrix: number[][]) => Promise<number>;
  matrixTranspose: (matrix: number[][]) => Promise<number[][]>;
  matrixAdd: (a: number[][], b: number[][]) => Promise<number[][]>;
  matrixSubtract: (a: number[][], b: number[][]) => Promise<number[][]>;
  statsMean: (data: number[]) => Promise<number>;
  statsMedian: (data: number[]) => Promise<number>;
  statsMode: (data: number[]) => Promise<number[]>;
  statsStd: (data: number[]) => Promise<number>;
  statsVariance: (data: number[]) => Promise<number>;
  statsMin: (data: number[]) => Promise<number>;
  statsMax: (data: number[]) => Promise<number>;
  statsSum: (data: number[]) => Promise<number>;
}
