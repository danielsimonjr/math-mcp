// SPDX-License-Identifier: Apache-2.0
/**
 * @file index.ts
 * @description Main entry point for mathjs-wasm WASM modules
 * @module wasm
 */

// ============================================================================
// EXPORTS - Hello World Test
// ============================================================================

/**
 * Simple test function to verify WASM compilation and loading
 * @param a - First number
 * @param b - Second number
 * @returns Sum of a and b
 */
export function add(a: f64, b: f64): f64 {
  return a + b;
}

/**
 * Test function for matrix multiplication (placeholder)
 * @param size - Size of square matrix
 * @returns Test value
 */
export function testMatrixMultiply(size: i32): f64 {
  return f64(size * size);
}

// ============================================================================
// MATRIX OPERATIONS (To be implemented)
// ============================================================================

export {
  multiplySquare,
  multiplySquareBlocked,
  multiplyGeneral,
  transposeSquare,
  transposeSquareInPlace,
  transposeGeneral,
  determinant
} from './matrix/operations';

// ============================================================================
// STATISTICAL OPERATIONS (To be implemented)
// ============================================================================

// export { mean, median, std, variance } from './statistics/stats';

// ============================================================================
// ARRAY OPERATIONS (To be implemented)
// ============================================================================

// export { sum, product, min, max } from './array/operations';

// ============================================================================
// MATRIX OPERATIONS - RAW POINTERS (for JavaScript bindings)
// ============================================================================

export {
  multiplySquareRaw,
  multiplySquareBlockedRaw,
  multiplyGeneralRaw,
  transposeSquareRaw,
  transposeGeneralRaw,
  determinantRaw
} from './matrix/raw';

// ============================================================================
// STATISTICAL OPERATIONS
// ============================================================================

export {
  meanRaw,
  varianceRaw,
  stdRaw,
  minRaw,
  maxRaw,
  medianRaw,
  sumRaw,
  productRaw
} from './statistics/stats';
