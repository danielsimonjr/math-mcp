/**
 * @file correctness-tests.js
 * @description Mathematical correctness tests for WASM operations
 *
 * This test suite verifies that WASM-accelerated operations produce
 * mathematically correct results by comparing against mathjs reference
 * implementations.
 *
 * @since 3.1.1
 */

// Subject under test: the MathTS compute engine (compat) behind every tool.
import mathEngine from '../dist/math-engine.js';

const matrixMultiply = async (a, b) => mathEngine.multiply(a, b);
const matrixDeterminant = async (a) => mathEngine.det(a);
const matrixTranspose = async (a) => mathEngine.transpose(a);
const matrixAdd = async (a, b) => mathEngine.add(a, b);
const matrixSubtract = async (a, b) => mathEngine.subtract(a, b);
const statsMean = async (d) => mathEngine.mean(d);
const statsMedian = async (d) => mathEngine.median(d);
const statsStd = async (d) => mathEngine.std(d);
const statsVariance = async (d) => mathEngine.variance(d);
const statsMin = async (d) => mathEngine.min(d);
const statsMax = async (d) => mathEngine.max(d);
const statsSum = async (d) => mathEngine.sum(d);

// Independent naive reference oracle (replaces the former mathjs oracle) so the
// random-input correctness checks stay meaningful without a second library.
// std/variance use sample (÷(N-1)) to match MathTS/mathjs unbiased defaults.
const math = {
  mean: (a) => a.reduce((s, x) => s + x, 0) / a.length,
  sum: (a) => a.reduce((s, x) => s + x, 0),
  min: (a) => Math.min(...a),
  max: (a) => Math.max(...a),
  variance: (a) => {
    const m = math.mean(a);
    return a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1);
  },
  std: (a) => Math.sqrt(math.variance(a)),
  multiply: (A, B) => A.map((row) => B[0].map((_, j) => row.reduce((s, _v, k) => s + row[k] * B[k][j], 0))),
  add: (A, B) => A.map((r, i) => r.map((v, j) => v + B[i][j])),
  subtract: (A, B) => A.map((r, i) => r.map((v, j) => v - B[i][j])),
  transpose: (A) => A[0].map((_, j) => A.map((r) => r[j])),
  // O(n^3) determinant via Gaussian elimination with partial pivoting —
  // the random det test uses up to 12x12, where naive cofactor (O(n!)) hangs.
  det: (M) => {
    const n = M.length;
    const a = M.map((r) => r.slice());
    let d = 1;
    for (let i = 0; i < n; i++) {
      let p = i;
      for (let r = i + 1; r < n; r++) if (Math.abs(a[r][i]) > Math.abs(a[p][i])) p = r;
      if (Math.abs(a[p][i]) < 1e-15) return 0;
      if (p !== i) {
        [a[i], a[p]] = [a[p], a[i]];
        d = -d;
      }
      d *= a[i][i];
      for (let r = i + 1; r < n; r++) {
        const f = a[r][i] / a[i][i];
        for (let c = i; c < n; c++) a[r][c] -= f * a[i][c];
      }
    }
    return d;
  },
};

// Test configuration
const FLOAT_TOLERANCE = 1e-10;
const NUM_RANDOM_TESTS = 50;
const VERBOSE = process.env.VERBOSE === 'true';

// Test statistics
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

/**
 * Asserts two numbers are close within tolerance.
 *
 * Uses a combined absolute + relative tolerance:
 *   |actual - expected| <= tolerance * max(1, |expected|, |actual|)
 *
 * The relative scaling is required because the WASM and mathjs floating-point
 * paths legitimately diverge in the last few bits. For a large-magnitude
 * result like a determinant near 1e22, a single ULP is ~1e6, so a purely
 * absolute threshold (e.g. 1e-6) can never hold even though the values agree
 * to full double precision. Scaling by the operand magnitude makes the check
 * a true relative-error test for large values while preserving the original
 * absolute behavior for values with magnitude <= 1.
 */
function assertClose(actual, expected, tolerance = FLOAT_TOLERANCE, context = '') {
  const diff = Math.abs(actual - expected);
  const scale = Math.max(1, Math.abs(expected), Math.abs(actual));
  if (diff > tolerance * scale) {
    throw new Error(
      `Assertion failed ${context}: Expected ${expected}, got ${actual} (diff: ${diff})`
    );
  }
}

/**
 * Asserts two matrices are close within tolerance
 */
function assertMatricesClose(actual, expected, tolerance = FLOAT_TOLERANCE, context = '') {
  if (actual.length !== expected.length) {
    throw new Error(
      `Matrix dimension mismatch ${context}: Expected ${expected.length} rows, got ${actual.length}`
    );
  }

  for (let i = 0; i < actual.length; i++) {
    if (actual[i].length !== expected[i].length) {
      throw new Error(
        `Matrix dimension mismatch ${context} row ${i}: Expected ${expected[i].length} cols, got ${actual[i].length}`
      );
    }

    for (let j = 0; j < actual[i].length; j++) {
      assertClose(actual[i][j], expected[i][j], tolerance, `${context} at [${i}][${j}]`);
    }
  }
}

/**
 * Asserts two arrays are close within tolerance
 */
function assertArraysClose(actual, expected, tolerance = FLOAT_TOLERANCE, context = '') {
  if (actual.length !== expected.length) {
    throw new Error(
      `Array length mismatch ${context}: Expected ${expected.length}, got ${actual.length}`
    );
  }

  for (let i = 0; i < actual.length; i++) {
    assertClose(actual[i], expected[i], tolerance, `${context} at [${i}]`);
  }
}

/**
 * Generates a random matrix
 */
function randomMatrix(rows, cols, min = -100, max = 100) {
  return Array(rows)
    .fill(0)
    .map(() =>
      Array(cols)
        .fill(0)
        .map(() => Math.random() * (max - min) + min)
    );
}

/**
 * Generates a random array
 */
function randomArray(length, min = -100, max = 100) {
  return Array(length)
    .fill(0)
    .map(() => Math.random() * (max - min) + min);
}

/**
 * Runs a single test
 */
async function runTest(name, testFn) {
  totalTests++;
  try {
    await testFn();
    passedTests++;
    if (VERBOSE) {
      console.log(`  ✓ ${name}`);
    }
  } catch (error) {
    failedTests++;
    console.error(`  ✗ ${name}`);
    console.error(`    ${error.message}`);
  }
}

// ============================================================================
// Matrix Multiplication Tests
// ============================================================================

async function testMatrixMultiplyKnownCases() {
  const testCases = [
    {
      name: '2×2 identity matrix',
      a: [
        [1, 0],
        [0, 1],
      ],
      b: [
        [5, 6],
        [7, 8],
      ],
      expected: [
        [5, 6],
        [7, 8],
      ],
    },
    {
      name: '2×2 standard multiplication',
      a: [
        [1, 2],
        [3, 4],
      ],
      b: [
        [5, 6],
        [7, 8],
      ],
      expected: [
        [19, 22],
        [43, 50],
      ],
    },
    {
      name: '3×3 multiplication',
      a: [
        [1, 2, 3],
        [4, 5, 6],
        [7, 8, 9],
      ],
      b: [
        [9, 8, 7],
        [6, 5, 4],
        [3, 2, 1],
      ],
      expected: [
        [30, 24, 18],
        [84, 69, 54],
        [138, 114, 90],
      ],
    },
    {
      name: '2×3 × 3×2 multiplication',
      a: [
        [1, 2, 3],
        [4, 5, 6],
      ],
      b: [
        [7, 8],
        [9, 10],
        [11, 12],
      ],
      expected: [
        [58, 64],
        [139, 154],
      ],
    },
  ];

  for (const tc of testCases) {
    await runTest(`Matrix multiply: ${tc.name}`, async () => {
      const result = await matrixMultiply(tc.a, tc.b);
      assertMatricesClose(result, tc.expected, FLOAT_TOLERANCE, tc.name);
    });
  }
}

async function testMatrixMultiplyRandom() {
  for (let i = 0; i < NUM_RANDOM_TESTS; i++) {
    await runTest(`Matrix multiply: random ${i + 1}/${NUM_RANDOM_TESTS}`, async () => {
      const size = Math.floor(Math.random() * 20) + 10; // 10-30
      const a = randomMatrix(size, size);
      const b = randomMatrix(size, size);

      const result = await matrixMultiply(a, b);
      const expected = math.multiply(a, b);

      assertMatricesClose(result, expected, 1e-8, `random test ${i + 1}`);
    });
  }
}

// ============================================================================
// Matrix Determinant Tests
// ============================================================================

async function testDeterminantKnownCases() {
  const testCases = [
    {
      name: '2×2 identity',
      matrix: [
        [1, 0],
        [0, 1],
      ],
      expected: 1,
    },
    {
      name: '2×2 standard',
      matrix: [
        [1, 2],
        [3, 4],
      ],
      expected: -2,
    },
    {
      name: '3×3 standard',
      matrix: [
        [1, 2, 3],
        [4, 5, 6],
        [7, 8, 9],
      ],
      expected: 0, // Singular matrix
    },
    {
      name: '3×3 non-singular',
      matrix: [
        [1, 2, 3],
        [4, 5, 6],
        [7, 8, 10],
      ],
      expected: -3,
    },
    {
      name: '4×4 identity',
      matrix: [
        [1, 0, 0, 0],
        [0, 1, 0, 0],
        [0, 0, 1, 0],
        [0, 0, 0, 1],
      ],
      expected: 1,
    },
  ];

  for (const tc of testCases) {
    await runTest(`Determinant: ${tc.name}`, async () => {
      const result = await matrixDeterminant(tc.matrix);
      assertClose(result, tc.expected, 1e-8, tc.name);
    });
  }
}

async function testDeterminantRandom() {
  for (let i = 0; i < NUM_RANDOM_TESTS; i++) {
    await runTest(`Determinant: random ${i + 1}/${NUM_RANDOM_TESTS}`, async () => {
      const size = Math.floor(Math.random() * 8) + 5; // 5-12
      const matrix = randomMatrix(size, size);

      const result = await matrixDeterminant(matrix);
      const expected = math.det(matrix);

      assertClose(result, expected, 1e-6, `random test ${i + 1}`);
    });
  }
}

// ============================================================================
// Matrix Transpose Tests
// ============================================================================

async function testTransposeKnownCases() {
  const testCases = [
    {
      name: '2×2 matrix',
      matrix: [
        [1, 2],
        [3, 4],
      ],
      expected: [
        [1, 3],
        [2, 4],
      ],
    },
    {
      name: '3×2 matrix',
      matrix: [
        [1, 2],
        [3, 4],
        [5, 6],
      ],
      expected: [
        [1, 3, 5],
        [2, 4, 6],
      ],
    },
    {
      name: '1×5 matrix',
      matrix: [[1, 2, 3, 4, 5]],
      expected: [[1], [2], [3], [4], [5]],
    },
  ];

  for (const tc of testCases) {
    await runTest(`Transpose: ${tc.name}`, async () => {
      const result = await matrixTranspose(tc.matrix);
      assertMatricesClose(result, tc.expected, FLOAT_TOLERANCE, tc.name);
    });
  }
}

async function testTransposeRandom() {
  for (let i = 0; i < NUM_RANDOM_TESTS; i++) {
    await runTest(`Transpose: random ${i + 1}/${NUM_RANDOM_TESTS}`, async () => {
      const rows = Math.floor(Math.random() * 20) + 20; // 20-40
      const cols = Math.floor(Math.random() * 20) + 20;
      const matrix = randomMatrix(rows, cols);

      const result = await matrixTranspose(matrix);
      const expected = math.transpose(matrix);

      assertMatricesClose(result, expected, FLOAT_TOLERANCE, `random test ${i + 1}`);
    });
  }
}

// ============================================================================
// Matrix Addition/Subtraction Tests
// ============================================================================

async function testMatrixAddSubtract() {
  const a = [
    [1, 2, 3],
    [4, 5, 6],
  ];
  const b = [
    [7, 8, 9],
    [10, 11, 12],
  ];

  await runTest('Matrix addition', async () => {
    const result = await matrixAdd(a, b);
    const expected = math.add(a, b);
    assertMatricesClose(result, expected, FLOAT_TOLERANCE, 'addition');
  });

  await runTest('Matrix subtraction', async () => {
    const result = await matrixSubtract(a, b);
    const expected = math.subtract(a, b);
    assertMatricesClose(result, expected, FLOAT_TOLERANCE, 'subtraction');
  });
}

// ============================================================================
// Statistics Tests
// ============================================================================

async function testStatsMeanKnownCases() {
  const testCases = [
    { name: 'simple', data: [1, 2, 3, 4, 5], expected: 3 },
    { name: 'negative', data: [-5, -3, -1, 1, 3, 5], expected: 0 },
    { name: 'decimals', data: [1.5, 2.5, 3.5, 4.5], expected: 3 },
    { name: 'large values', data: [1000, 2000, 3000], expected: 2000 },
  ];

  for (const tc of testCases) {
    await runTest(`Mean: ${tc.name}`, async () => {
      const result = await statsMean(tc.data);
      assertClose(result, tc.expected, 1e-10, tc.name);
    });
  }
}

async function testStatsMedianKnownCases() {
  const testCases = [
    { name: 'odd count', data: [1, 2, 3, 4, 5], expected: 3 },
    { name: 'even count', data: [1, 2, 3, 4], expected: 2.5 },
    { name: 'unsorted', data: [5, 1, 3, 2, 4], expected: 3 },
  ];

  for (const tc of testCases) {
    await runTest(`Median: ${tc.name}`, async () => {
      const result = await statsMedian(tc.data);
      assertClose(result, tc.expected, 1e-10, tc.name);
    });
  }
}

async function testStatsVarianceStd() {
  const data = [2, 4, 4, 4, 5, 5, 7, 9];

  await runTest('Variance', async () => {
    const result = await statsVariance(data);
    const expected = math.variance(data);
    assertClose(result, expected, 1e-8, 'variance');
  });

  await runTest('Standard deviation', async () => {
    const result = await statsStd(data);
    const expected = math.std(data);
    assertClose(result, expected, 1e-8, 'std');
  });
}

async function testStatsMinMax() {
  const data = [3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5];

  await runTest('Min', async () => {
    const result = await statsMin(data);
    const expected = math.min(data);
    assertClose(result, expected, FLOAT_TOLERANCE, 'min');
  });

  await runTest('Max', async () => {
    const result = await statsMax(data);
    const expected = math.max(data);
    assertClose(result, expected, FLOAT_TOLERANCE, 'max');
  });
}

async function testStatsSum() {
  const testCases = [
    { name: 'positive', data: [1, 2, 3, 4, 5], expected: 15 },
    { name: 'negative', data: [-1, -2, -3], expected: -6 },
    { name: 'mixed', data: [-5, 10, -3, 8], expected: 10 },
  ];

  for (const tc of testCases) {
    await runTest(`Sum: ${tc.name}`, async () => {
      const result = await statsSum(tc.data);
      assertClose(result, tc.expected, FLOAT_TOLERANCE, tc.name);
    });
  }
}

async function testStatsRandomData() {
  for (let i = 0; i < NUM_RANDOM_TESTS; i++) {
    await runTest(`Stats random: ${i + 1}/${NUM_RANDOM_TESTS}`, async () => {
      const length = Math.floor(Math.random() * 500) + 100; // 100-600
      const data = randomArray(length);

      // Test multiple stats operations on same data
      const [mean, variance, std, min, max, sum] = await Promise.all([
        statsMean(data),
        statsVariance(data),
        statsStd(data),
        statsMin(data),
        statsMax(data),
        statsSum(data),
      ]);

      assertClose(mean, math.mean(data), 1e-8, `mean random ${i + 1}`);
      assertClose(variance, math.variance(data), 1e-6, `variance random ${i + 1}`);
      assertClose(std, math.std(data), 1e-8, `std random ${i + 1}`);
      assertClose(min, math.min(data), FLOAT_TOLERANCE, `min random ${i + 1}`);
      assertClose(max, math.max(data), FLOAT_TOLERANCE, `max random ${i + 1}`);
      assertClose(sum, math.sum(data), 1e-8, `sum random ${i + 1}`);
    });
  }
}

// ============================================================================
// Edge Cases
// ============================================================================

async function testEdgeCases() {
  await runTest('Large matrix (100×100) multiplication', async () => {
    const size = 100;
    const a = randomMatrix(size, size);
    const b = randomMatrix(size, size);

    const result = await matrixMultiply(a, b);
    const expected = math.multiply(a, b);

    assertMatricesClose(result, expected, 1e-6, 'large matrix');
  });

  await runTest('Very small values', async () => {
    const data = [1e-10, 2e-10, 3e-10, 4e-10];
    const result = await statsMean(data);
    const expected = math.mean(data);
    assertClose(result, expected, 1e-15, 'small values');
  });

  await runTest('Very large values', async () => {
    const data = [1e10, 2e10, 3e10, 4e10];
    const result = await statsMean(data);
    const expected = math.mean(data);
    assertClose(result, expected, 1e5, 'large values');
  });

  await runTest('Large array (10000 elements)', async () => {
    const data = randomArray(10000);
    const result = await statsMean(data);
    const expected = math.mean(data);
    assertClose(result, expected, 1e-8, 'large array');
  });
}

// ============================================================================
// Main Test Runner
// ============================================================================

async function runAllTests() {
  console.log('\n🧪 Mathematical Correctness Tests\n');
  console.log('='.repeat(60));

  const startTime = Date.now();

  console.log('\n📐 Matrix Operations');
  await testMatrixMultiplyKnownCases();
  await testMatrixMultiplyRandom();
  await testDeterminantKnownCases();
  await testDeterminantRandom();
  await testTransposeKnownCases();
  await testTransposeRandom();
  await testMatrixAddSubtract();

  console.log('\n📊 Statistics Operations');
  await testStatsMeanKnownCases();
  await testStatsMedianKnownCases();
  await testStatsVarianceStd();
  await testStatsMinMax();
  await testStatsSum();
  await testStatsRandomData();

  console.log('\n🔬 Edge Cases');
  await testEdgeCases();

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log('\n' + '='.repeat(60));
  console.log('\n📊 Test Summary');
  console.log(`Total: ${totalTests}`);
  console.log(`✓ Passed: ${passedTests}`);
  console.log(`✗ Failed: ${failedTests}`);
  console.log(`Duration: ${duration}s`);

  if (failedTests > 0) {
    console.log(`\n❌ ${failedTests} test(s) failed`);
    process.exit(1);
  } else {
    console.log(`\n✅ All tests passed!`);
    process.exit(0);
  }
}

// Run tests
runAllTests().catch((error) => {
  console.error('\n❌ Test suite failed:');
  console.error(error);
  process.exit(1);
});
