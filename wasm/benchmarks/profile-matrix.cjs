/**
 * Profiling script for mathjs matrix operations
 * Establishes baseline performance for comparison with WASM implementation
 */

const math = require('../../lib/cjs/');

// Utility function to measure execution time
function benchmark(name, fn, iterations = 1000) {
  // Warmup
  for (let i = 0; i < 10; i++) {
    fn();
  }

  // Actual benchmark
  const start = process.hrtime.bigint();
  for (let i = 0; i < iterations; i++) {
    fn();
  }
  const end = process.hrtime.bigint();

  const totalMs = Number(end - start) / 1_000_000;
  const avgMs = totalMs / iterations;

  console.log(`${name}:`);
  console.log(`  Total: ${totalMs.toFixed(2)}ms for ${iterations} iterations`);
  console.log(`  Average: ${avgMs.toFixed(4)}ms per operation`);
  console.log(`  Throughput: ${(1000 / avgMs).toFixed(0)} ops/sec`);
  console.log();

  return { totalMs, avgMs, throughput: 1000 / avgMs };
}

console.log('=== Matrix Operations Baseline Performance ===\n');

// Matrix Multiply - Small (3x3)
const small3x3_a = [[1, 2, 3], [4, 5, 6], [7, 8, 9]];
const small3x3_b = [[9, 8, 7], [6, 5, 4], [3, 2, 1]];

const result_small = benchmark(
  'Matrix Multiply 3x3',
  () => math.multiply(small3x3_a, small3x3_b),
  10000
);

// Matrix Multiply - Medium (10x10)
const medium10x10_a = Array(10).fill(0).map((_, i) =>
  Array(10).fill(0).map((_, j) => i * 10 + j)
);
const medium10x10_b = Array(10).fill(0).map((_, i) =>
  Array(10).fill(0).map((_, j) => (i + j) % 10)
);

const result_medium = benchmark(
  'Matrix Multiply 10x10',
  () => math.multiply(medium10x10_a, medium10x10_b),
  1000
);

// Matrix Multiply - Large (50x50)
const large50x50_a = Array(50).fill(0).map((_, i) =>
  Array(50).fill(0).map((_, j) => Math.sin(i) + Math.cos(j))
);
const large50x50_b = Array(50).fill(0).map((_, i) =>
  Array(50).fill(0).map((_, j) => Math.cos(i) - Math.sin(j))
);

const result_large = benchmark(
  'Matrix Multiply 50x50',
  () => math.multiply(large50x50_a, large50x50_b),
  100
);

// Matrix Multiply - Very Large (100x100)
const xlarge100x100_a = Array(100).fill(0).map((_, i) =>
  Array(100).fill(0).map((_, j) => (i + j) / 100)
);
const xlarge100x100_b = Array(100).fill(0).map((_, i) =>
  Array(100).fill(0).map((_, j) => (i - j) / 100)
);

const result_xlarge = benchmark(
  'Matrix Multiply 100x100',
  () => math.multiply(xlarge100x100_a, xlarge100x100_b),
  10
);

// Matrix Determinant - Small (3x3)
const det_small = benchmark(
  'Matrix Determinant 3x3',
  () => math.det(small3x3_a),
  10000
);

// Matrix Determinant - Medium (10x10)
const det_medium = benchmark(
  'Matrix Determinant 10x10',
  () => math.det(medium10x10_a),
  1000
);

// Matrix Transpose - Small (3x3)
const transpose_small = benchmark(
  'Matrix Transpose 3x3',
  () => math.transpose(small3x3_a),
  10000
);

// Matrix Transpose - Medium (10x10)
const transpose_medium = benchmark(
  'Matrix Transpose 10x10',
  () => math.transpose(medium10x10_a),
  10000
);

// Matrix Transpose - Large (100x100)
const transpose_large = benchmark(
  'Matrix Transpose 100x100',
  () => math.transpose(xlarge100x100_a),
  1000
);

console.log('=== Summary ===');
console.log('Target: 5-10x speedup for matrix operations in WASM');
console.log('\nBaseline established. Next: Implement WASM versions and compare.');

// Export results for comparison
const results = {
  timestamp: new Date().toISOString(),
  version: 'mathjs v15.0.0 (baseline)',
  benchmarks: {
    multiply_3x3: result_small,
    multiply_10x10: result_medium,
    multiply_50x50: result_large,
    multiply_100x100: result_xlarge,
    det_3x3: det_small,
    det_10x10: det_medium,
    transpose_3x3: transpose_small,
    transpose_10x10: transpose_medium,
    transpose_100x100: transpose_large
  }
};

// Save results to file
const fs = require('fs');
const path = require('path');
const resultsPath = path.join(__dirname, 'baseline-results.json');
fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
console.log(`\nResults saved to: ${resultsPath}`);
