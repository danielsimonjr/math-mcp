/**
 * @file differential-matrix.cjs
 * @description Differential testing: Compare WASM implementation vs mathjs
 *
 * This test suite generates thousands of test cases and compares results
 * between the WASM implementation and the original mathjs library.
 */

const math = require('../../lib/cjs/');
const wasmMatrix = require('../bindings/matrix.cjs');

// Test configuration
const EPSILON = 1e-10; // Tolerance for floating-point comparison
let passedTests = 0;
let failedTests = 0;
let totalTests = 0;

/**
 * Compare two floating-point numbers with epsilon tolerance
 */
function almostEqual(a, b, epsilon = EPSILON) {
  const diff = Math.abs(a - b);
  const avg = (Math.abs(a) + Math.abs(b)) / 2;
  
  // Use relative error for large numbers
  if (avg > 1000) {
    return (diff / avg) < epsilon;
  }
  
  // Use absolute error for small numbers
  return diff < epsilon;
}

/**
 * Compare two matrices
 */
function matricesEqual(a, b, epsilon = EPSILON) {
  if (a.length !== b.length) return false;

  for (let i = 0; i < a.length; i++) {
    if (a[i].length !== b[i].length) return false;

    for (let j = 0; j < a[i].length; j++) {
      if (!almostEqual(a[i][j], b[i][j], epsilon)) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Run a differential test
 */
function test(name, wasmResult, mathjsResult, compareFn = matricesEqual) {
  totalTests++;

  const passed = compareFn(wasmResult, mathjsResult);

  if (passed) {
    passedTests++;
  } else {
    failedTests++;
    console.error(`FAIL: ${name}`);
    console.error('  WASM result:', wasmResult);
    console.error('  mathjs result:', mathjsResult);
  }

  return passed;
}

/**
 * Generate random matrix
 */
function randomMatrix(rows, cols, min = -10, max = 10) {
  const matrix = [];
  for (let i = 0; i < rows; i++) {
    const row = [];
    for (let j = 0; j < cols; j++) {
      row.push(min + Math.random() * (max - min));
    }
    matrix.push(row);
  }
  return matrix;
}

/**
 * Generate special matrices for edge cases
 */
function identityMatrix(size) {
  const matrix = [];
  for (let i = 0; i < size; i++) {
    const row = [];
    for (let j = 0; j < size; j++) {
      row.push(i === j ? 1 : 0);
    }
    matrix.push(row);
  }
  return matrix;
}

function zeroMatrix(rows, cols) {
  return Array(rows).fill(0).map(() => Array(cols).fill(0));
}

function onesMatrix(rows, cols) {
  return Array(rows).fill(0).map(() => Array(cols).fill(1));
}

/**
 * Main test suite
 */
async function runTests() {
  console.log('=== Differential Testing: WASM vs mathjs ===\n');

  // Initialize WASM
  await wasmMatrix.init();
  console.log('WASM module initialized\n');

  // ========================================================================
  // Matrix Multiply Tests
  // ========================================================================

  console.log('--- Matrix Multiply Tests ---');

  // Small matrices (3x3)
  for (let i = 0; i < 100; i++) {
    const a = randomMatrix(3, 3);
    const b = randomMatrix(3, 3);

    const wasmResult = wasmMatrix.multiply(a, b);
    const mathjsResult = math.multiply(a, b);

    test(`multiply 3x3 #${i + 1}`, wasmResult, mathjsResult);
  }

  // Medium matrices (10x10)
  for (let i = 0; i < 100; i++) {
    const a = randomMatrix(10, 10);
    const b = randomMatrix(10, 10);

    const wasmResult = wasmMatrix.multiply(a, b);
    const mathjsResult = math.multiply(a, b);

    test(`multiply 10x10 #${i + 1}`, wasmResult, mathjsResult);
  }

  // Larger matrices (50x50)
  for (let i = 0; i < 50; i++) {
    const a = randomMatrix(50, 50);
    const b = randomMatrix(50, 50);

    const wasmResult = wasmMatrix.multiply(a, b);
    const mathjsResult = math.multiply(a, b);

    test(`multiply 50x50 #${i + 1}`, wasmResult, mathjsResult);
  }

  // Very large matrices (100x100) - test blocked algorithm
  for (let i = 0; i < 20; i++) {
    const a = randomMatrix(100, 100);
    const b = randomMatrix(100, 100);

    const wasmResult = wasmMatrix.multiply(a, b);
    const mathjsResult = math.multiply(a, b);

    test(`multiply 100x100 #${i + 1}`, wasmResult, mathjsResult);
  }

  // Edge cases
  const testMat = randomMatrix(3, 3);
  test('multiply identity 3x3', wasmMatrix.multiply(identityMatrix(3), testMat), math.multiply(identityMatrix(3), testMat));

  const m1 = randomMatrix(5, 5);
  test('multiply by identity', wasmMatrix.multiply(m1, identityMatrix(5)), m1);

  test('multiply zero matrix', wasmMatrix.multiply(zeroMatrix(4, 4), randomMatrix(4, 4)), zeroMatrix(4, 4));

  // Non-square matrices
  for (let i = 0; i < 100; i++) {
    const a = randomMatrix(5, 3);
    const b = randomMatrix(3, 7);

    const wasmResult = wasmMatrix.multiply(a, b);
    const mathjsResult = math.multiply(a, b);

    test(`multiply 5x3 × 3x7 #${i + 1}`, wasmResult, mathjsResult);
  }

  // ========================================================================
  // Matrix Transpose Tests
  // ========================================================================

  console.log('\n--- Matrix Transpose Tests ---');

  // Square matrices
  for (let size of [2, 3, 5, 10, 20, 50, 100]) {
    for (let i = 0; i < 50; i++) {
      const a = randomMatrix(size, size);

      const wasmResult = wasmMatrix.transpose(a);
      const mathjsResult = math.transpose(a);

      test(`transpose ${size}x${size} #${i + 1}`, wasmResult, mathjsResult);
    }
  }

  // Non-square matrices
  for (let i = 0; i < 100; i++) {
    const a = randomMatrix(5, 10);

    const wasmResult = wasmMatrix.transpose(a);
    const mathjsResult = math.transpose(a);

    test(`transpose 5x10 #${i + 1}`, wasmResult, mathjsResult);
  }

  for (let i = 0; i < 100; i++) {
    const a = randomMatrix(20, 5);

    const wasmResult = wasmMatrix.transpose(a);
    const mathjsResult = math.transpose(a);

    test(`transpose 20x5 #${i + 1}`, wasmResult, mathjsResult);
  }

  // Double transpose should equal original
  for (let i = 0; i < 50; i++) {
    const a = randomMatrix(10, 10);
    const transposed = wasmMatrix.transpose(a);
    const doubleTransposed = wasmMatrix.transpose(transposed);

    test(`double transpose 10x10 #${i + 1}`, doubleTransposed, a);
  }

  // ========================================================================
  // Matrix Determinant Tests
  // ========================================================================

  console.log('\n--- Matrix Determinant Tests ---');

  // 2x2 matrices
  for (let i = 0; i < 100; i++) {
    const a = randomMatrix(2, 2);

    const wasmResult = wasmMatrix.det(a);
    const mathjsResult = math.det(a);

    test(`det 2x2 #${i + 1}`, wasmResult, mathjsResult, (a, b) => almostEqual(a, b, 1e-8));
  }

  // 3x3 matrices
  for (let i = 0; i < 100; i++) {
    const a = randomMatrix(3, 3);

    const wasmResult = wasmMatrix.det(a);
    const mathjsResult = math.det(a);

    test(`det 3x3 #${i + 1}`, wasmResult, mathjsResult, (a, b) => almostEqual(a, b, 1e-8));
  }

  // Larger matrices
  for (let size of [5, 10, 20]) {
    for (let i = 0; i < 50; i++) {
      const a = randomMatrix(size, size, -5, 5);

      const wasmResult = wasmMatrix.det(a);
      const mathjsResult = math.det(a);

      // Larger tolerance for larger matrices due to numerical precision
      const tolerance = size >= 20 ? 1e-4 : size > 10 ? 1e-5 : 1e-6;
      test(`det ${size}x${size} #${i + 1}`, wasmResult, mathjsResult, (a, b) => almostEqual(a, b, tolerance));
    }
  }

  // Edge cases
  test('det identity', wasmMatrix.det(identityMatrix(5)), 1.0, (a, b) => almostEqual(a, b));

  test('det zero matrix', wasmMatrix.det(zeroMatrix(3, 3)), 0.0, (a, b) => almostEqual(a, b));

  // Singular matrix
  const singular = [[1, 2, 3], [2, 4, 6], [3, 6, 9]];
  test('det singular', wasmMatrix.det(singular), 0.0, (a, b) => almostEqual(a, b, 1e-10));

  // ========================================================================
  // Results
  // ========================================================================

  console.log('\n=== Test Results ===');
  console.log(`Total tests: ${totalTests}`);
  console.log(`Passed: ${passedTests}`);
  console.log(`Failed: ${failedTests}`);
  console.log(`Success rate: ${((passedTests / totalTests) * 100).toFixed(2)}%`);

  if (failedTests === 0) {
    console.log('\n✓ All differential tests passed!');
    return 0;
  } else {
    console.error(`\n✗ ${failedTests} tests failed`);
    return 1;
  }
}

// Run tests
runTests().then(exitCode => {
  process.exit(exitCode);
}).catch(err => {
  console.error('Test suite error:', err);
  process.exit(1);
});
