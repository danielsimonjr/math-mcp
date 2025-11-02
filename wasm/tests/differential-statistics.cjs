/**
 * @file differential-statistics.cjs
 * @description Differential testing: Compare WASM vs mathjs statistics
 */

const math = require('../../lib/cjs/');
const wasmStats = require('../bindings/statistics.cjs');

const EPSILON = 1e-10;
let passedTests = 0;
let failedTests = 0;
let totalTests = 0;

function almostEqual(a, b, epsilon = EPSILON) {
  if (isNaN(a) && isNaN(b)) return true;
  const diff = Math.abs(a - b);
  const avg = (Math.abs(a) + Math.abs(b)) / 2;

  if (avg > 1000) {
    return (diff / avg) < epsilon;
  }

  return diff < epsilon;
}

function test(name, wasmResult, mathjsResult) {
  totalTests++;

  const passed = almostEqual(wasmResult, mathjsResult);

  if (passed) {
    passedTests++;
  } else {
    failedTests++;
    console.error(`FAIL: ${name}`);
    console.error(`  WASM result: ${wasmResult}`);
    console.error(`  mathjs result: ${mathjsResult}`);
  }

  return passed;
}

function randomArray(length, min = -100, max = 100) {
  return Array.from({ length }, () => min + Math.random() * (max - min));
}

async function runTests() {
  console.log('=== Differential Testing: WASM vs mathjs (Statistics) ===\n');

  await wasmStats.init();
  console.log('WASM module initialized\n');

  // ========================================================================
  // Mean Tests
  // ========================================================================

  console.log('--- Mean Tests ---');

  for (let i = 0; i < 100; i++) {
    const arr = randomArray(100);
    test(`mean 100 elements #${i + 1}`, wasmStats.mean(arr), math.mean(arr));
  }

  for (let i = 0; i < 50; i++) {
    const arr = randomArray(1000);
    test(`mean 1K elements #${i + 1}`, wasmStats.mean(arr), math.mean(arr));
  }

  for (let i = 0; i < 20; i++) {
    const arr = randomArray(10000);
    test(`mean 10K elements #${i + 1}`, wasmStats.mean(arr), math.mean(arr));
  }

  // Skip empty array test - mathjs throws error
  test('mean single element', wasmStats.mean([42]), math.mean([42]));
  test('mean all zeros', wasmStats.mean([0, 0, 0, 0]), math.mean([0, 0, 0, 0]));
  test('mean negative', wasmStats.mean([-1, -2, -3]), math.mean([-1, -2, -3]));

  // ========================================================================
  // Variance Tests
  // ========================================================================

  console.log('\n--- Variance Tests ---');

  for (let i = 0; i < 100; i++) {
    const arr = randomArray(100);
    test(`variance 100 elements #${i + 1}`, wasmStats.variance(arr), math.variance(arr));
  }

  for (let i = 0; i < 50; i++) {
    const arr = randomArray(1000);
    test(`variance 1K elements #${i + 1}`, wasmStats.variance(arr), math.variance(arr));
  }

  for (let i = 0; i < 20; i++) {
    const arr = randomArray(10000);
    test(`variance 10K elements #${i + 1}`, wasmStats.variance(arr), math.variance(arr));
  }

  // Skip empty array test
  // Skip single element - mathjs handles differently
  test('variance constant', wasmStats.variance([5, 5, 5, 5]), math.variance([5, 5, 5, 5]));

  // ========================================================================
  // Standard Deviation Tests
  // ========================================================================

  console.log('\n--- Standard Deviation Tests ---');

  for (let i = 0; i < 100; i++) {
    const arr = randomArray(100);
    test(`std 100 elements #${i + 1}`, wasmStats.std(arr), math.std(arr));
  }

  for (let i = 0; i < 50; i++) {
    const arr = randomArray(1000);
    test(`std 1K elements #${i + 1}`, wasmStats.std(arr), math.std(arr));
  }

  for (let i = 0; i < 20; i++) {
    const arr = randomArray(10000);
    test(`std 10K elements #${i + 1}`, wasmStats.std(arr), math.std(arr));
  }

  // ========================================================================
  // Min Tests
  // ========================================================================

  console.log('\n--- Min Tests ---');

  for (let i = 0; i < 100; i++) {
    const arr = randomArray(100);
    test(`min 100 elements #${i + 1}`, wasmStats.min(arr), math.min(arr));
  }

  for (let i = 0; i < 50; i++) {
    const arr = randomArray(1000);
    test(`min 1K elements #${i + 1}`, wasmStats.min(arr), math.min(arr));
  }

  for (let i = 0; i < 20; i++) {
    const arr = randomArray(10000);
    test(`min 10K elements #${i + 1}`, wasmStats.min(arr), math.min(arr));
  }

  // Skip empty array test
  test('min single', wasmStats.min([42]), math.min([42]));
  test('min negative', wasmStats.min([-10, -5, -15]), math.min([-10, -5, -15]));

  // ========================================================================
  // Max Tests
  // ========================================================================

  console.log('\n--- Max Tests ---');

  for (let i = 0; i < 100; i++) {
    const arr = randomArray(100);
    test(`max 100 elements #${i + 1}`, wasmStats.max(arr), math.max(arr));
  }

  for (let i = 0; i < 50; i++) {
    const arr = randomArray(1000);
    test(`max 1K elements #${i + 1}`, wasmStats.max(arr), math.max(arr));
  }

  for (let i = 0; i < 20; i++) {
    const arr = randomArray(10000);
    test(`max 10K elements #${i + 1}`, wasmStats.max(arr), math.max(arr));
  }

  // Skip empty array test
  test('max single', wasmStats.max([42]), math.max([42]));
  test('max negative', wasmStats.max([-10, -5, -15]), math.max([-10, -5, -15]));

  // ========================================================================
  // Median Tests
  // ========================================================================

  console.log('\n--- Median Tests ---');

  for (let i = 0; i < 100; i++) {
    const arr = randomArray(100);
    test(`median 100 elements #${i + 1}`, wasmStats.median(arr), math.median(arr));
  }

  for (let i = 0; i < 50; i++) {
    const arr = randomArray(1000);
    test(`median 1K elements #${i + 1}`, wasmStats.median(arr), math.median(arr));
  }

  for (let i = 0; i < 20; i++) {
    const arr = randomArray(10000);
    test(`median 10K elements #${i + 1}`, wasmStats.median(arr), math.median(arr));
  }

  // Skip empty array test
  test('median single', wasmStats.median([42]), math.median([42]));
  test('median even length', wasmStats.median([1, 2, 3, 4]), math.median([1, 2, 3, 4]));
  test('median odd length', wasmStats.median([1, 2, 3, 4, 5]), math.median([1, 2, 3, 4, 5]));

  // ========================================================================
  // Sum Tests
  // ========================================================================

  console.log('\n--- Sum Tests ---');

  for (let i = 0; i < 100; i++) {
    const arr = randomArray(100);
    test(`sum 100 elements #${i + 1}`, wasmStats.sum(arr), math.sum(arr));
  }

  for (let i = 0; i < 50; i++) {
    const arr = randomArray(1000);
    test(`sum 1K elements #${i + 1}`, wasmStats.sum(arr), math.sum(arr));
  }

  // Skip empty array test
  test('sum single', wasmStats.sum([42]), math.sum([42]));

  // ========================================================================
  // Product Tests
  // ========================================================================

  console.log('\n--- Product Tests ---');

  for (let i = 0; i < 100; i++) {
    const arr = randomArray(10, 0.1, 2.0);
    test(`product 10 elements #${i + 1}`, wasmStats.product(arr), math.prod(arr));
  }

  // Skip empty array test
  test('product single', wasmStats.product([42]), math.prod([42]));
  test('product with zero', wasmStats.product([1, 2, 0, 3]), math.prod([1, 2, 0, 3]));

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

runTests().then(exitCode => {
  process.exit(exitCode);
}).catch(err => {
  console.error('Test suite error:', err);
  process.exit(1);
});
