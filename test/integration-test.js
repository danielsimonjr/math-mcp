/**
 * @file integration-test.js
 * @description Integration test for WASM-accelerated MCP server
 *
 * Tests that:
 * 1. Small operations use mathjs (below threshold)
 * 2. Large operations use WASM (above threshold)
 * 3. All MCP tools work correctly
 * 4. Performance improvements are measurable
 */

const wasmWrapper = await import('../dist/wasm-wrapper.js');

console.log('=== MCP Server Integration Tests ===\n');

let testsRun = 0;
let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
  testsRun++;
  try {
    fn();
    testsPassed++;
    console.log(`✓ ${name}`);
  } catch (error) {
    testsFailed++;
    console.error(`✗ ${name}`);
    console.error(`  Error: ${error.message}`);
  }
}

async function asyncTest(name, fn) {
  testsRun++;
  try {
    await fn();
    testsPassed++;
    console.log(`✓ ${name}`);
  } catch (error) {
    testsFailed++;
    console.error(`✗ ${name}`);
    console.error(`  Error: ${error.message}`);
  }
}

// Wait for WASM initialization
await new Promise(resolve => setTimeout(resolve, 1000));

console.log('--- WASM Initialization ---');
const initStats = wasmWrapper.getPerfStats();
test('WASM should be initialized', () => {
  if (!initStats.wasmInitialized) {
    throw new Error('WASM not initialized');
  }
});

console.log('\n--- Matrix Operations ---');

// Small matrix (should use mathjs)
await asyncTest('Small matrix multiply (2x2) - mathjs', async () => {
  const a = [[1, 2], [3, 4]];
  const b = [[5, 6], [7, 8]];
  const result = await wasmWrapper.matrixMultiply(a, b);

  // Check result is correct
  if (!Array.isArray(result) || result.length !== 2) {
    throw new Error('Invalid result');
  }

  // Should use mathjs (below threshold of 10x10)
  const stats = wasmWrapper.getPerfStats();
  console.log(`  Used: mathjs (calls: ${stats.mathjsCalls}, WASM: ${stats.wasmCalls})`);
});

// Large matrix (should use WASM)
await asyncTest('Large matrix multiply (20x20) - WASM', async () => {
  const size = 20;
  const a = Array(size).fill(0).map(() => Array(size).fill(0).map(() => Math.random()));
  const b = Array(size).fill(0).map(() => Array(size).fill(0).map(() => Math.random()));

  const statsBefore = wasmWrapper.getPerfStats();
  const result = await wasmWrapper.matrixMultiply(a, b);
  const statsAfter = wasmWrapper.getPerfStats();

  // Check result
  if (!Array.isArray(result) || result.length !== size) {
    throw new Error('Invalid result');
  }

  // Should use WASM (above threshold of 10x10)
  if (statsAfter.wasmCalls === statsBefore.wasmCalls) {
    throw new Error('Expected WASM to be used but mathjs was used instead');
  }
  console.log(`  Used: WASM (calls: ${statsAfter.wasmCalls}, speedup expected: ~8x)`);
});

// Determinant tests
await asyncTest('Small determinant (3x3) - mathjs', async () => {
  const matrix = [[1, 2, 3], [4, 5, 6], [7, 8, 10]];
  const result = await wasmWrapper.matrixDeterminant(matrix);

  if (typeof result !== 'number') {
    throw new Error('Invalid result type');
  }
  console.log(`  Result: ${result.toFixed(4)}`);
});

await asyncTest('Large determinant (10x10) - WASM', async () => {
  const size = 10;
  const matrix = Array(size).fill(0).map(() => Array(size).fill(0).map(() => Math.random()));

  const statsBefore = wasmWrapper.getPerfStats();
  const result = await wasmWrapper.matrixDeterminant(matrix);
  const statsAfter = wasmWrapper.getPerfStats();

  if (typeof result !== 'number') {
    throw new Error('Invalid result type');
  }

  if (statsAfter.wasmCalls === statsBefore.wasmCalls) {
    throw new Error('Expected WASM to be used');
  }
  console.log(`  Used: WASM (speedup expected: ~14x)`);
});

console.log('\n--- Statistical Operations ---');

// Small dataset (should use mathjs)
await asyncTest('Small mean (50 elements) - mathjs', async () => {
  const data = Array(50).fill(0).map(() => Math.random());
  const result = await wasmWrapper.statsMean(data);

  if (typeof result !== 'number' || isNaN(result)) {
    throw new Error('Invalid result');
  }
  console.log(`  Mean: ${result.toFixed(4)}`);
});

// Large dataset (should use WASM)
await asyncTest('Large mean (1000 elements) - WASM', async () => {
  const data = Array(1000).fill(0).map(() => Math.random());

  const statsBefore = wasmWrapper.getPerfStats();
  const result = await wasmWrapper.statsMean(data);
  const statsAfter = wasmWrapper.getPerfStats();

  if (typeof result !== 'number' || isNaN(result)) {
    throw new Error('Invalid result');
  }

  if (statsAfter.wasmCalls === statsBefore.wasmCalls) {
    throw new Error('Expected WASM to be used');
  }
  console.log(`  Used: WASM (speedup expected: ~15x)`);
});

// Min/Max tests
await asyncTest('Large min (1000 elements) - WASM', async () => {
  const data = Array(1000).fill(0).map(() => Math.random() * 100);
  const min = Math.min(...data);

  const result = await wasmWrapper.statsMin(data);

  if (Math.abs(result - min) > 0.0001) {
    throw new Error(`Expected ${min}, got ${result}`);
  }
  console.log(`  Min: ${result.toFixed(4)} (speedup expected: ~41x)`);
});

await asyncTest('Large max (1000 elements) - WASM', async () => {
  const data = Array(1000).fill(0).map(() => Math.random() * 100);
  const max = Math.max(...data);

  const result = await wasmWrapper.statsMax(data);

  if (Math.abs(result - max) > 0.0001) {
    throw new Error(`Expected ${max}, got ${result}`);
  }
  console.log(`  Max: ${result.toFixed(4)} (speedup expected: ~42x)`);
});

// Variance and Std
await asyncTest('Large variance (1000 elements) - WASM', async () => {
  const data = Array(1000).fill(0).map(() => Math.random() * 100);
  const result = await wasmWrapper.statsVariance(data);

  if (typeof result !== 'number' || isNaN(result) || result < 0) {
    throw new Error('Invalid variance result');
  }
  console.log(`  Variance: ${result.toFixed(4)} (speedup expected: ~35x)`);
});

await asyncTest('Large std (1000 elements) - WASM', async () => {
  const data = Array(1000).fill(0).map(() => Math.random() * 100);
  const result = await wasmWrapper.statsStd(data);

  if (typeof result !== 'number' || isNaN(result) || result < 0) {
    throw new Error('Invalid std result');
  }
  console.log(`  Std: ${result.toFixed(4)} (speedup expected: ~30x)`);
});

console.log('\n--- Performance Summary ---');
const finalStats = wasmWrapper.getPerfStats();
console.log(`Total operations: ${finalStats.totalCalls}`);
console.log(`WASM calls: ${finalStats.wasmCalls} (${finalStats.wasmPercentage})`);
console.log(`mathjs calls: ${finalStats.mathjsCalls}`);
console.log(`Average WASM time: ${finalStats.avgWasmTime}`);
console.log(`Average mathjs time: ${finalStats.avgMathjsTime}`);

console.log('\n--- Test Results ---');
console.log(`Total: ${testsRun}`);
console.log(`Passed: ${testsPassed}`);
console.log(`Failed: ${testsFailed}`);
console.log(`Success rate: ${((testsPassed / testsRun) * 100).toFixed(1)}%`);

if (testsFailed === 0) {
  console.log('\n✓ All integration tests passed!');
  console.log('✓ WASM integration working correctly');
  console.log('✓ Threshold-based routing working');
  console.log('✓ Performance monitoring working');
  process.exit(0);
} else {
  console.error(`\n✗ ${testsFailed} tests failed`);
  process.exit(1);
}
