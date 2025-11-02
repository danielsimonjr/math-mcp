/**
 * @file compare-wasm-vs-js.cjs
 * @description Benchmark WASM vs JavaScript matrix operations
 * Measures actual speedup achieved by WASM implementation
 */

const math = require('../../lib/cjs/');
const wasmMatrix = require('../bindings/matrix.cjs');

/**
 * Benchmark a function
 */
function benchmark(name, fn, iterations = 1000) {
  // Warmup
  for (let i = 0; i < 10; i++) fn();

  // Measure
  const start = process.hrtime.bigint();
  for (let i = 0; i < iterations; i++) fn();
  const end = process.hrtime.bigint();

  const totalMs = Number(end - start) / 1_000_000;
  const avgMs = totalMs / iterations;
  const opsPerSec = 1000 / avgMs;

  return { name, totalMs, avgMs, opsPerSec, iterations };
}

/**
 * Compare two implementations
 */
function compare(name, jsFn, wasmFn, iterations) {
  console.log(`\n${name}:`);

  const jsResult = benchmark('JavaScript', jsFn, iterations);
  const wasmResult = benchmark('WASM', wasmFn, iterations);

  const speedup = jsResult.avgMs / wasmResult.avgMs;

  console.log(`  JavaScript: ${jsResult.avgMs.toFixed(4)}ms per op (${jsResult.opsPerSec.toFixed(0)} ops/sec)`);
  console.log(`  WASM:       ${wasmResult.avgMs.toFixed(4)}ms per op (${wasmResult.opsPerSec.toFixed(0)} ops/sec)`);
  console.log(`  Speedup:    ${speedup.toFixed(2)}x ${speedup >= 1 ? '✓' : '✗'}`);

  return { name, jsResult, wasmResult, speedup };
}

async function runBenchmarks() {
  console.log('=== WASM vs JavaScript Performance Comparison ===\n');

  // Initialize WASM
  await wasmMatrix.init();
  console.log('WASM module initialized\n');

  const results = [];

  // ========================================================================
  // Matrix Multiply Benchmarks
  // ========================================================================

  console.log('--- Matrix Multiply ---');

  // 3x3
  const a3x3 = [[1, 2, 3], [4, 5, 6], [7, 8, 9]];
  const b3x3 = [[9, 8, 7], [6, 5, 4], [3, 2, 1]];

  results.push(compare(
    'Multiply 3x3',
    () => math.multiply(a3x3, b3x3),
    () => wasmMatrix.multiply(a3x3, b3x3),
    10000
  ));

  // 10x10
  const a10x10 = Array(10).fill(0).map((_, i) =>
    Array(10).fill(0).map((_, j) => i * 10 + j)
  );
  const b10x10 = Array(10).fill(0).map((_, i) =>
    Array(10).fill(0).map((_, j) => (i + j) % 10)
  );

  results.push(compare(
    'Multiply 10x10',
    () => math.multiply(a10x10, b10x10),
    () => wasmMatrix.multiply(a10x10, b10x10),
    1000
  ));

  // 50x50
  const a50x50 = Array(50).fill(0).map((_, i) =>
    Array(50).fill(0).map((_, j) => Math.sin(i) + Math.cos(j))
  );
  const b50x50 = Array(50).fill(0).map((_, i) =>
    Array(50).fill(0).map((_, j) => Math.cos(i) - Math.sin(j))
  );

  results.push(compare(
    'Multiply 50x50',
    () => math.multiply(a50x50, b50x50),
    () => wasmMatrix.multiply(a50x50, b50x50),
    100
  ));

  // 100x100
  const a100x100 = Array(100).fill(0).map((_, i) =>
    Array(100).fill(0).map((_, j) => (i + j) / 100)
  );
  const b100x100 = Array(100).fill(0).map((_, i) =>
    Array(100).fill(0).map((_, j) => (i - j) / 100)
  );

  results.push(compare(
    'Multiply 100x100',
    () => math.multiply(a100x100, b100x100),
    () => wasmMatrix.multiply(a100x100, b100x100),
    10
  ));

  // ========================================================================
  // Determinant Benchmarks
  // ========================================================================

  console.log('\n--- Determinant ---');

  results.push(compare(
    'Determinant 3x3',
    () => math.det(a3x3),
    () => wasmMatrix.det(a3x3),
    10000
  ));

  results.push(compare(
    'Determinant 10x10',
    () => math.det(a10x10),
    () => wasmMatrix.det(a10x10),
    1000
  ));

  results.push(compare(
    'Determinant 50x50',
    () => math.det(a50x50),
    () => wasmMatrix.det(a50x50),
    100
  ));

  // ========================================================================
  // Transpose Benchmarks
  // ========================================================================

  console.log('\n--- Transpose ---');

  results.push(compare(
    'Transpose 3x3',
    () => math.transpose(a3x3),
    () => wasmMatrix.transpose(a3x3),
    10000
  ));

  results.push(compare(
    'Transpose 10x10',
    () => math.transpose(a10x10),
    () => wasmMatrix.transpose(a10x10),
    10000
  ));

  results.push(compare(
    'Transpose 100x100',
    () => math.transpose(a100x100),
    () => wasmMatrix.transpose(a100x100),
    1000
  ));

  // ========================================================================
  // Summary
  // ========================================================================

  console.log('\n=== Summary ===\n');

  const multiplyResults = results.filter(r => r.name.startsWith('Multiply'));
  const detResults = results.filter(r => r.name.startsWith('Determinant'));
  const transposeResults = results.filter(r => r.name.startsWith('Transpose'));

  const avgMultiplySpeedup = multiplyResults.reduce((sum, r) => sum + r.speedup, 0) / multiplyResults.length;
  const avgDetSpeedup = detResults.reduce((sum, r) => sum + r.speedup, 0) / detResults.length;
  const avgTransposeSpeedup = transposeResults.reduce((sum, r) => sum + r.speedup, 0) / transposeResults.length;
  const overallAvgSpeedup = results.reduce((sum, r) => sum + r.speedup, 0) / results.length;

  console.log(`Matrix Multiply:   ${avgMultiplySpeedup.toFixed(2)}x average speedup`);
  console.log(`Determinant:       ${avgDetSpeedup.toFixed(2)}x average speedup`);
  console.log(`Transpose:         ${avgTransposeSpeedup.toFixed(2)}x average speedup`);
  console.log(`\nOverall Average:   ${overallAvgSpeedup.toFixed(2)}x speedup`);

  const goalMet = avgMultiplySpeedup >= 5 && overallAvgSpeedup >= 2;
  console.log(`\nGoal (5-10x multiply, 2-5x overall): ${goalMet ? '✓ MET' : '✗ NOT MET'}`);

  // Save results
  const fs = require('fs');
  const path = require('path');
  fs.writeFileSync(
    path.join(__dirname, 'wasm-vs-js-results.json'),
    JSON.stringify({
      timestamp: new Date().toISOString(),
      results,
      summary: {
        multiply: avgMultiplySpeedup,
        determinant: avgDetSpeedup,
        transpose: avgTransposeSpeedup,
        overall: overallAvgSpeedup,
        goalMet
      }
    }, null, 2)
  );

  console.log('\nResults saved to wasm-vs-js-results.json');

  return goalMet ? 0 : 1;
}

runBenchmarks().then(exitCode => {
  process.exit(exitCode);
}).catch(err => {
  console.error('Benchmark error:', err);
  process.exit(1);
});
