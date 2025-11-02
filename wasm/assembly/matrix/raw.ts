// SPDX-License-Identifier: Apache-2.0
/**
 * @file raw.ts
 * @description Matrix operations using raw memory pointers (no AS objects)
 * @module wasm/matrix/raw
 */

/**
 * Matrix multiplication for square matrices using raw pointers
 * @param aPtr - Pointer to first matrix data
 * @param bPtr - Pointer to second matrix data
 * @param cPtr - Pointer to result matrix data
 * @param size - Dimension of square matrices
 */
export function multiplySquareRaw(aPtr: usize, bPtr: usize, cPtr: usize, size: i32): void {
  for (let i = 0; i < size; i++) {
    const rowOffset = i * size;

    for (let j = 0; j < size; j++) {
      let sum: f64 = 0.0;

      for (let k = 0; k < size; k++) {
        sum += load<f64>(aPtr + (rowOffset + k) * 8) * load<f64>(bPtr + (k * size + j) * 8);
      }

      store<f64>(cPtr + (rowOffset + j) * 8, sum);
    }
  }
}

/**
 * Matrix multiplication with blocking for better cache performance
 */
export function multiplySquareBlockedRaw(aPtr: usize, bPtr: usize, cPtr: usize, size: i32): void {
  // Initialize result to zero
  for (let i = 0; i < size * size; i++) {
    store<f64>(cPtr + i * 8, 0.0);
  }

  const BLOCK_SIZE: i32 = 32;

  for (let ii = 0; ii < size; ii += BLOCK_SIZE) {
    for (let jj = 0; jj < size; jj += BLOCK_SIZE) {
      for (let kk = 0; kk < size; kk += BLOCK_SIZE) {

        const iMax = min(ii + BLOCK_SIZE, size);
        const jMax = min(jj + BLOCK_SIZE, size);
        const kMax = min(kk + BLOCK_SIZE, size);

        for (let i = ii; i < iMax; i++) {
          const rowOffset = i * size;

          for (let j = jj; j < jMax; j++) {
            let sum = load<f64>(cPtr + (rowOffset + j) * 8);

            for (let k = kk; k < kMax; k++) {
              sum += load<f64>(aPtr + (rowOffset + k) * 8) * load<f64>(bPtr + (k * size + j) * 8);
            }

            store<f64>(cPtr + (rowOffset + j) * 8, sum);
          }
        }
      }
    }
  }
}

/**
 * General matrix multiplication (non-square)
 */
export function multiplyGeneralRaw(
  aPtr: usize,
  bPtr: usize,
  cPtr: usize,
  m: i32,
  n: i32,
  p: i32
): void {
  for (let i = 0; i < m; i++) {
    const rowOffset = i * n;

    for (let j = 0; j < p; j++) {
      let sum: f64 = 0.0;

      for (let k = 0; k < n; k++) {
        sum += load<f64>(aPtr + (rowOffset + k) * 8) * load<f64>(bPtr + (k * p + j) * 8);
      }

      store<f64>(cPtr + (i * p + j) * 8, sum);
    }
  }
}

/**
 * Matrix transpose (square)
 */
export function transposeSquareRaw(aPtr: usize, bPtr: usize, size: i32): void {
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      store<f64>(bPtr + (j * size + i) * 8, load<f64>(aPtr + (i * size + j) * 8));
    }
  }
}

/**
 * General matrix transpose (non-square)
 */
export function transposeGeneralRaw(aPtr: usize, bPtr: usize, rows: i32, cols: i32): void {
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      store<f64>(bPtr + (j * rows + i) * 8, load<f64>(aPtr + (i * cols + j) * 8));
    }
  }
}

/**
 * Matrix determinant using LU decomposition
 */
export function determinantRaw(aPtr: usize, size: i32): f64 {
  // Special cases
  if (size == 1) {
    return load<f64>(aPtr);
  }

  if (size == 2) {
    return load<f64>(aPtr) * load<f64>(aPtr + 3 * 8) - load<f64>(aPtr + 8) * load<f64>(aPtr + 2 * 8);
  }

  if (size == 3) {
    // Direct calculation for 3x3
    const a00 = load<f64>(aPtr);
    const a01 = load<f64>(aPtr + 8);
    const a02 = load<f64>(aPtr + 16);
    const a10 = load<f64>(aPtr + 24);
    const a11 = load<f64>(aPtr + 32);
    const a12 = load<f64>(aPtr + 40);
    const a20 = load<f64>(aPtr + 48);
    const a21 = load<f64>(aPtr + 56);
    const a22 = load<f64>(aPtr + 64);

    return a00 * (a11 * a22 - a12 * a21) -
           a01 * (a10 * a22 - a12 * a20) +
           a02 * (a10 * a21 - a11 * a20);
  }

  // LU decomposition for larger matrices
  return determinantLURaw(aPtr, size);
}

/**
 * Determinant using LU decomposition
 */
function determinantLURaw(aPtr: usize, size: i32): f64 {
  let det: f64 = 1.0;
  let swapCount: i32 = 0;

  for (let k = 0; k < size - 1; k++) {
    // Find pivot
    let maxIdx = k;
    let maxVal = abs(load<f64>(aPtr + (k * size + k) * 8));

    for (let i = k + 1; i < size; i++) {
      const val = abs(load<f64>(aPtr + (i * size + k) * 8));
      if (val > maxVal) {
        maxVal = val;
        maxIdx = i;
      }
    }

    // Swap rows if needed
    if (maxIdx != k) {
      for (let j = k; j < size; j++) {
        const idx1Ptr = aPtr + (k * size + j) * 8;
        const idx2Ptr = aPtr + (maxIdx * size + j) * 8;
        const temp = load<f64>(idx1Ptr);
        store<f64>(idx1Ptr, load<f64>(idx2Ptr));
        store<f64>(idx2Ptr, temp);
      }
      swapCount++;
    }

    const pivotPtr = aPtr + (k * size + k) * 8;
    const pivot = load<f64>(pivotPtr);

    if (abs(pivot) < 1e-15) {
      return 0.0;
    }

    // Eliminate column
    for (let i = k + 1; i < size; i++) {
      const factorPtr = aPtr + (i * size + k) * 8;
      const factor = load<f64>(factorPtr) / pivot;
      store<f64>(factorPtr, factor);

      for (let j = k + 1; j < size; j++) {
        const ijPtr = aPtr + (i * size + j) * 8;
        const kjPtr = aPtr + (k * size + j) * 8;
        store<f64>(ijPtr, load<f64>(ijPtr) - factor * load<f64>(kjPtr));
      }
    }
  }

  // Calculate determinant from diagonal
  for (let i = 0; i < size; i++) {
    det *= load<f64>(aPtr + (i * size + i) * 8);
  }

  // Adjust for row swaps
  if (swapCount % 2 != 0) {
    det = -det;
  }

  return det;
}

@inline
function min(a: i32, b: i32): i32 {
  return a < b ? a : b;
}

@inline
function abs(x: f64): f64 {
  return x < 0 ? -x : x;
}
