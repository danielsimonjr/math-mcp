/**
 * @file profile-statistics.cjs
 * @description Profile mathjs statistical functions to establish baseline
 */

const math = require('../../lib/cjs/');

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

  console.log(`${name}:`);
  console.log(`  Total: ${totalMs.toFixed(2)}ms for ${iterations} iterations`);
  console.log(`  Average: ${avgMs.toFixed(4)}ms per operation`);
  console.log(`  Throughput: ${opsPerSec.toFixed(0)} ops/sec`);
  console.log();

  return { totalMs, avgMs, opsPerSec };
}

console.log('=== Statistical Functions Baseline Performance ===\n');

// Generate test datasets
const small = Array.from({ length: 100 }, () => Math.random() * 100);
const medium = Array.from({ length: 1000 }, () => Math.random() * 100);
const large = Array.from({ length: 10000 }, () => Math.random() * 100);
const xlarge = Array.from({ length: 100000 }, () => Math.random() * 100);
const xxlarge = Array.from({ length: 1000000 }, () => Math.random() * 100);

// Mean
console.log('--- Mean ---');
benchmark('Mean 100 elements', () => math.mean(small), 10000);
benchmark('Mean 1K elements', () => math.mean(medium), 1000);
benchmark('Mean 10K elements', () => math.mean(large), 1000);
benchmark('Mean 100K elements', () => math.mean(xlarge), 100);
benchmark('Mean 1M elements', () => math.mean(xxlarge), 10);

// Median
console.log('--- Median ---');
benchmark('Median 100 elements', () => math.median(small), 10000);
benchmark('Median 1K elements', () => math.median(medium), 1000);
benchmark('Median 10K elements', () => math.median(large), 100);
benchmark('Median 100K elements', () => math.median(xlarge), 10);

// Standard Deviation
console.log('--- Standard Deviation ---');
benchmark('Std 100 elements', () => math.std(small), 10000);
benchmark('Std 1K elements', () => math.std(medium), 1000);
benchmark('Std 10K elements', () => math.std(large), 1000);
benchmark('Std 100K elements', () => math.std(xlarge), 100);
benchmark('Std 1M elements', () => math.std(xxlarge), 10);

// Variance
console.log('--- Variance ---');
benchmark('Variance 100 elements', () => math.variance(small), 10000);
benchmark('Variance 1K elements', () => math.variance(medium), 1000);
benchmark('Variance 10K elements', () => math.variance(large), 1000);
benchmark('Variance 100K elements', () => math.variance(xlarge), 100);
benchmark('Variance 1M elements', () => math.variance(xxlarge), 10);

// Min
console.log('--- Min ---');
benchmark('Min 100 elements', () => math.min(small), 10000);
benchmark('Min 1K elements', () => math.min(medium), 10000);
benchmark('Min 10K elements', () => math.min(large), 1000);
benchmark('Min 100K elements', () => math.min(xlarge), 100);
benchmark('Min 1M elements', () => math.min(xxlarge), 10);

// Max
console.log('--- Max ---');
benchmark('Max 100 elements', () => math.max(small), 10000);
benchmark('Max 1K elements', () => math.max(medium), 10000);
benchmark('Max 10K elements', () => math.max(large), 1000);
benchmark('Max 100K elements', () => math.max(xlarge), 100);
benchmark('Max 1M elements', () => math.max(xxlarge), 10);

console.log('=== Summary ===');
console.log('Target: 2-5x speedup for statistical operations in WASM');
console.log('\nBaseline established. Next: Implement WASM versions and compare.');
