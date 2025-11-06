// SPDX-License-Identifier: Apache-2.0
/**
 * @file operations.ts
 * @description High-performance matrix operations in WASM
 * @module wasm/matrix
 */

// ============================================================================
// MATRIX MULTIPLY
// ============================================================================

/**
 * Matrix multiplication for square matrices (optimized for performance)
 * Computes C = A × B where all matrices are stored in row-major order
 *
 * Memory layout:
 * - Input matrices A and B are passed as flat f64 arrays
 * - Output matrix C is also a flat f64 array
 * - Element at row i, col j is at index [i * size + j]
 *
 * @param a - Pointer to first matrix (size × size elements)
 * @param b - Pointer to second matrix (size × size elements)
 * @param c - Pointer to result matrix (size × size elements)
 * @param size - Dimension of square matrices
 */
export function multiplySquare(a: usize, b: usize, c: usize, size: i32): void {
  // Cast pointers to f64 arrays
  const matA = changetype<Float64Array>(a);
  const matB = changetype<Float64Array>(b);
  const matC = changetype<Float64Array>(c);

  // Standard matrix multiplication: C[i,j] = sum(A[i,k] * B[k,j])
  for (let i = 0; i < size; i++) {
    const rowOffset = i * size;

    for (let j = 0; j < size; j++) {
      let sum: f64 = 0.0;

      // Inner loop: dot product of row i from A with column j from B
      for (let k = 0; k < size; k++) {
        sum += unchecked(matA[rowOffset + k] * matB[k * size + j]);
      }

      unchecked(matC[rowOffset + j] = sum);
    }
  }
}

/**
 * Matrix multiplication with blocking/tiling for cache efficiency
 * Better performance for larger matrices (>= 32x32)
 *
 * @param a - Pointer to first matrix
 * @param b - Pointer to second matrix
 * @param c - Pointer to result matrix
 * @param size - Dimension of square matrices
 */
export function multiplySquareBlocked(a: usize, b: usize, c: usize, size: i32): void {
  const matA = changetype<Float64Array>(a);
  const matB = changetype<Float64Array>(b);
  const matC = changetype<Float64Array>(c);

  // Initialize result matrix to zero
  for (let i = 0; i < size * size; i++) {
    unchecked(matC[i] = 0.0);
  }

  // Block size for cache optimization (tune based on cache size)
  const BLOCK_SIZE: i32 = 32;

  // Blocked matrix multiplication
  for (let ii = 0; ii < size; ii += BLOCK_SIZE) {
    for (let jj = 0; jj < size; jj += BLOCK_SIZE) {
      for (let kk = 0; kk < size; kk += BLOCK_SIZE) {

        // Process block
        const iMax = min(ii + BLOCK_SIZE, size);
        const jMax = min(jj + BLOCK_SIZE, size);
        const kMax = min(kk + BLOCK_SIZE, size);

        for (let i = ii; i < iMax; i++) {
          const rowOffset = i * size;

          for (let j = jj; j < jMax; j++) {
            let sum: f64 = unchecked(matC[rowOffset + j]);

            for (let k = kk; k < kMax; k++) {
              sum += unchecked(matA[rowOffset + k] * matB[k * size + j]);
            }

            unchecked(matC[rowOffset + j] = sum);
          }
        }
      }
    }
  }
}

/**
 * General matrix multiplication (non-square matrices)
 * Computes C = A × B where A is m×n, B is n×p, and C is m×p
 *
 * @param a - Pointer to first matrix (m × n elements)
 * @param b - Pointer to second matrix (n × p elements)
 * @param c - Pointer to result matrix (m × p elements)
 * @param m - Number of rows in A
 * @param n - Number of columns in A / rows in B
 * @param p - Number of columns in B
 */
export function multiplyGeneral(
  a: usize,
  b: usize,
  c: usize,
  m: i32,
  n: i32,
  p: i32
): void {
  const matA = changetype<Float64Array>(a);
  const matB = changetype<Float64Array>(b);
  const matC = changetype<Float64Array>(c);

  for (let i = 0; i < m; i++) {
    const rowOffset = i * n;

    for (let j = 0; j < p; j++) {
      let sum: f64 = 0.0;

      for (let k = 0; k < n; k++) {
        sum += unchecked(matA[rowOffset + k] * matB[k * p + j]);
      }

      unchecked(matC[i * p + j] = sum);
    }
  }
}

// ============================================================================
// MATRIX TRANSPOSE
// ============================================================================

/**
 * In-place matrix transpose for square matrices
 * More memory efficient but modifies input
 *
 * @param a - Pointer to matrix to transpose
 * @param size - Dimension of square matrix
 */
export function transposeSquareInPlace(a: usize, size: i32): void {
  const mat = changetype<Float64Array>(a);

  for (let i = 0; i < size; i++) {
    for (let j = i + 1; j < size; j++) {
      // Swap mat[i,j] with mat[j,i]
      const idx1 = i * size + j;
      const idx2 = j * size + i;

      const temp = unchecked(mat[idx1]);
      unchecked(mat[idx1] = mat[idx2]);
      unchecked(mat[idx2] = temp);
    }
  }
}

/**
 * Out-of-place matrix transpose for square matrices
 * Does not modify input
 *
 * @param a - Pointer to input matrix
 * @param b - Pointer to output matrix
 * @param size - Dimension of square matrix
 */
export function transposeSquare(a: usize, b: usize, size: i32): void {
  const matA = changetype<Float64Array>(a);
  const matB = changetype<Float64Array>(b);

  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      unchecked(matB[j * size + i] = matA[i * size + j]);
    }
  }
}

/**
 * General matrix transpose (non-square)
 * Transposes m×n matrix to n×m matrix
 *
 * @param a - Pointer to input matrix (m × n)
 * @param b - Pointer to output matrix (n × m)
 * @param rows - Number of rows in input
 * @param cols - Number of columns in input
 */
export function transposeGeneral(a: usize, b: usize, rows: i32, cols: i32): void {
  const matA = changetype<Float64Array>(a);
  const matB = changetype<Float64Array>(b);

  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      unchecked(matB[j * rows + i] = matA[i * cols + j]);
    }
  }
}

// ============================================================================
// MATRIX DETERMINANT
// ============================================================================

/**
 * Calculate determinant using LU decomposition
 * More numerically stable for larger matrices
 *
 * @param a - Pointer to matrix
 * @param size - Dimension of square matrix
 * @returns Determinant value
 */
export function determinant(a: usize, size: i32): f64 {
  const mat = changetype<Float64Array>(a);

  // Special cases
  if (size == 1) {
    return unchecked(mat[0]);
  }

  if (size == 2) {
    return unchecked(mat[0] * mat[3] - mat[1] * mat[2]);
  }

  if (size == 3) {
    // Direct calculation for 3x3 (faster than LU)
    return unchecked(
      mat[0] * (mat[4] * mat[8] - mat[5] * mat[7]) -
      mat[1] * (mat[3] * mat[8] - mat[5] * mat[6]) +
      mat[2] * (mat[3] * mat[7] - mat[4] * mat[6])
    );
  }

  // For larger matrices, use LU decomposition
  return determinantLU(a, size);
}

/**
 * Calculate determinant using LU decomposition with partial pivoting
 *
 * @param a - Pointer to matrix (will be modified)
 * @param size - Dimension of square matrix
 * @returns Determinant value
 */
function determinantLU(a: usize, size: i32): f64 {
  const mat = changetype<Float64Array>(a);
  let det: f64 = 1.0;
  let swapCount: i32 = 0;

  // LU decomposition with partial pivoting
  for (let k = 0; k < size - 1; k++) {
    // Find pivot
    let maxIdx = k;
    let maxVal = abs(unchecked(mat[k * size + k]));

    for (let i = k + 1; i < size; i++) {
      const val = abs(unchecked(mat[i * size + k]));
      if (val > maxVal) {
        maxVal = val;
        maxIdx = i;
      }
    }

    // Swap rows if needed
    if (maxIdx != k) {
      for (let j = k; j < size; j++) {
        const idx1 = k * size + j;
        const idx2 = maxIdx * size + j;
        const temp = unchecked(mat[idx1]);
        unchecked(mat[idx1] = mat[idx2]);
        unchecked(mat[idx2] = temp);
      }
      swapCount++;
    }

    const pivot = unchecked(mat[k * size + k]);

    // Check for singular matrix
    if (abs(pivot) < 1e-15) {
      return 0.0;
    }

    // Eliminate column
    for (let i = k + 1; i < size; i++) {
      const factor = unchecked(mat[i * size + k]) / pivot;
      unchecked(mat[i * size + k] = factor);

      for (let j = k + 1; j < size; j++) {
        unchecked(mat[i * size + j] -= factor * mat[k * size + j]);
      }
    }
  }

  // Calculate determinant from diagonal
  for (let i = 0; i < size; i++) {
    det *= unchecked(mat[i * size + i]);
  }

  // Adjust for row swaps
  if (swapCount % 2 != 0) {
    det = -det;
  }

  return det;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

@inline
function min(a: i32, b: i32): i32 {
  return a < b ? a : b;
}

@inline
function abs(x: f64): f64 {
  return x < 0 ? -x : x;
}

// ============================================================================
// MATRIX ADD & SUBTRACT
// ============================================================================

/**
 * Matrix addition for square matrices
 * Computes C = A + B where all matrices are n×n
 *
 * @param a - Pointer to first matrix (size × size elements)
 * @param b - Pointer to second matrix (size × size elements)
 * @param c - Pointer to result matrix (size × size elements)
 * @param size - Dimension of square matrices
 */
export function addSquare(a: usize, b: usize, c: usize, size: i32): void {
  const matA = changetype<Float64Array>(a);
  const matB = changetype<Float64Array>(b);
  const matC = changetype<Float64Array>(c);

  const length = size * size;
  for (let i = 0; i < length; i++) {
    unchecked(matC[i] = matA[i] + matB[i]);
  }
}

/**
 * Matrix subtraction for square matrices
 * Computes C = A - B where all matrices are n×n
 *
 * @param a - Pointer to first matrix (size × size elements)
 * @param b - Pointer to second matrix (size × size elements)
 * @param c - Pointer to result matrix (size × size elements)
 * @param size - Dimension of square matrices
 */
export function subtractSquare(a: usize, b: usize, c: usize, size: i32): void {
  const matA = changetype<Float64Array>(a);
  const matB = changetype<Float64Array>(b);
  const matC = changetype<Float64Array>(c);

  const length = size * size;
  for (let i = 0; i < length; i++) {
    unchecked(matC[i] = matA[i] - matB[i]);
  }
}

/**
 * General matrix addition (non-square matrices)
 * Computes C = A + B where all matrices are m×n
 *
 * @param a - Pointer to first matrix (m × n elements)
 * @param b - Pointer to second matrix (m × n elements)
 * @param c - Pointer to result matrix (m × n elements)
 * @param rows - Number of rows
 * @param cols - Number of columns
 */
export function addGeneral(a: usize, b: usize, c: usize, rows: i32, cols: i32): void {
  const matA = changetype<Float64Array>(a);
  const matB = changetype<Float64Array>(b);
  const matC = changetype<Float64Array>(c);

  const length = rows * cols;
  for (let i = 0; i < length; i++) {
    unchecked(matC[i] = matA[i] + matB[i]);
  }
}

/**
 * General matrix subtraction (non-square matrices)
 * Computes C = A - B where all matrices are m×n
 *
 * @param a - Pointer to first matrix (m × n elements)
 * @param b - Pointer to second matrix (m × n elements)
 * @param c - Pointer to result matrix (m × n elements)
 * @param rows - Number of rows
 * @param cols - Number of columns
 */
export function subtractGeneral(a: usize, b: usize, c: usize, rows: i32, cols: i32): void {
  const matA = changetype<Float64Array>(a);
  const matB = changetype<Float64Array>(b);
  const matC = changetype<Float64Array>(c);

  const length = rows * cols;
  for (let i = 0; i < length; i++) {
    unchecked(matC[i] = matA[i] - matB[i]);
  }
}
