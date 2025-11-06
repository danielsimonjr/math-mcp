// SPDX-License-Identifier: Apache-2.0
/**
 * @file stats.ts  
 * @description High-performance statistical functions in WASM
 * @module wasm/statistics
 */

// ============================================================================
// MEAN
// ============================================================================

export function meanRaw(ptr: usize, length: i32): f64 {
  if (length === 0) return NaN;

  let sum: f64 = 0.0;
  for (let i = 0; i < length; i++) {
    sum += load<f64>(ptr + i * 8);
  }

  return sum / f64(length);
}

// ============================================================================
// VARIANCE & STANDARD DEVIATION
// ============================================================================

export function varianceRaw(ptr: usize, length: i32, normalization: i32): f64 {
  if (length === 0) return NaN;
  if (length === 1) {
    if (normalization === 0) return NaN;
    return 0.0;
  }

  // First pass: calculate mean
  let sum: f64 = 0.0;
  for (let i = 0; i < length; i++) {
    sum += load<f64>(ptr + i * 8);
  }
  const mean = sum / f64(length);

  // Second pass: calculate variance
  let variance: f64 = 0.0;
  for (let i = 0; i < length; i++) {
    const diff = load<f64>(ptr + i * 8) - mean;
    variance += diff * diff;
  }

  // normalization: 0 = unbiased (n-1), 1 = biased (n)
  let divisor: f64 = f64(length);
  if (normalization === 0) {
    divisor = f64(length - 1);
  }
  
  return variance / divisor;
}

export function stdRaw(ptr: usize, length: i32, normalization: i32): f64 {
  const v = varianceRaw(ptr, length, normalization);
  return Math.sqrt(v);
}

// ============================================================================
// MIN & MAX
// ============================================================================

export function minRaw(ptr: usize, length: i32): f64 {
  if (length === 0) return NaN;

  let min = load<f64>(ptr);
  for (let i = 1; i < length; i++) {
    const val = load<f64>(ptr + i * 8);
    if (val < min) min = val;
  }

  return min;
}

export function maxRaw(ptr: usize, length: i32): f64 {
  if (length === 0) return NaN;

  let max = load<f64>(ptr);
  for (let i = 1; i < length; i++) {
    const val = load<f64>(ptr + i * 8);
    if (val > max) max = val;
  }

  return max;
}

// ============================================================================
// MEDIAN
// ============================================================================

export function medianRaw(ptr: usize, length: i32): f64 {
  if (length === 0) return NaN;

  quicksort(ptr, 0, length - 1);

  const mid = length >> 1;
  if (length % 2 === 0) {
    const val1 = load<f64>(ptr + (mid - 1) * 8);
    const val2 = load<f64>(ptr + mid * 8);
    return (val1 + val2) / 2.0;
  } else {
    return load<f64>(ptr + mid * 8);
  }
}

function quicksort(ptr: usize, left: i32, right: i32): void {
  if (left >= right) return;

  const pivot = partition(ptr, left, right);
  quicksort(ptr, left, pivot - 1);
  quicksort(ptr, pivot + 1, right);
}

function partition(ptr: usize, left: i32, right: i32): i32 {
  const pivotValue = load<f64>(ptr + right * 8);
  let i = left - 1;

  for (let j = left; j < right; j++) {
    if (load<f64>(ptr + j * 8) <= pivotValue) {
      i++;
      swap(ptr, i, j);
    }
  }

  swap(ptr, i + 1, right);
  return i + 1;
}

@inline
function swap(ptr: usize, i: i32, j: i32): void {
  const temp = load<f64>(ptr + i * 8);
  store<f64>(ptr + i * 8, load<f64>(ptr + j * 8));
  store<f64>(ptr + j * 8, temp);
}

// ============================================================================
// SUM & PRODUCT
// ============================================================================

export function sumRaw(ptr: usize, length: i32): f64 {
  let sum: f64 = 0.0;
  for (let i = 0; i < length; i++) {
    sum += load<f64>(ptr + i * 8);
  }
  return sum;
}

export function productRaw(ptr: usize, length: i32): f64 {
  if (length === 0) return 1.0;

  let product: f64 = 1.0;
  for (let i = 0; i < length; i++) {
    product *= load<f64>(ptr + i * 8);
  }
  return product;
}

// ============================================================================
// MODE
// ============================================================================

/**
 * Calculate mode (most frequent value) in a dataset
 * If multiple modes exist, returns the smallest one
 * If all values are unique, returns the smallest value
 *
 * @param ptr - Pointer to data array
 * @param length - Length of array
 * @returns Mode value
 */
export function modeRaw(ptr: usize, length: i32): f64 {
  if (length === 0) return NaN;
  if (length === 1) return load<f64>(ptr);

  // Sort the array first (needed to count consecutive values)
  quicksort(ptr, 0, length - 1);

  let maxCount = 1;
  let currentCount = 1;
  let modeValue = load<f64>(ptr);
  let currentValue = modeValue;

  // Count consecutive equal values
  for (let i = 1; i < length; i++) {
    const val = load<f64>(ptr + i * 8);

    if (val === currentValue) {
      currentCount++;
      if (currentCount > maxCount) {
        maxCount = currentCount;
        modeValue = currentValue;
      }
    } else {
      currentValue = val;
      currentCount = 1;
    }
  }

  return modeValue;
}
