/**
 * @file compare-statistics.cjs
 * @description Benchmark WASM vs mathjs statistical functions
 */

const math = require('../../lib/cjs/');
const wasmStats = require('../bindings/statistics.cjs');

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

  return { totalMs, avgMs, opsPerSec };
}

async function runBenchmarks() {
  await wasmStats.init();
  console.log('=== Statistical Functions: WASM vs mathjs ===\n');

  // Generate test datasets
  const small = Array.from({ length: 100 }, () => Math.random() * 100);
  const medium = Array.from({ length: 1000 }, () => Math.random() * 100);
  const large = Array.from({ length: 10000 }, () => Math.random() * 100);
  const xlarge = Array.from({ length: 100000 }, () => Math.random() * 100);
  const xxlarge = Array.from({ length: 1000000 }, () => Math.random() * 100);

  const results = [];

  function compareBenchmark(name, mathjsFn, wasmFn, iterations) {
    const mathjs = benchmark(name + ' (mathjs)', mathjsFn, iterations);
    const wasm = benchmark(name + ' (WASM)', wasmFn, iterations);
    const speedup = mathjs.avgMs / wasm.avgMs;

    console.log(`${name}:`);
    console.log(`  mathjs: ${mathjs.avgMs.toFixed(4)}ms (${mathjs.opsPerSec.toFixed(0)} ops/sec)`);
    console.log(`  WASM:   ${wasm.avgMs.toFixed(4)}ms (${wasm.opsPerSec.toFixed(0)} ops/sec)`);
    console.log(`  Speedup: ${speedup.toFixed(2)}x`);
    console.log();

    results.push({ name, mathjs, wasm, speedup });
  }

  // Mean
  console.log('--- Mean ---');
  compareBenchmark('Mean 100 elements', () => math.mean(small), () => wasmStats.mean(small), 10000);
  compareBenchmark('Mean 1K elements', () => math.mean(medium), () => wasmStats.mean(medium), 1000);
  compareBenchmark('Mean 10K elements', () => math.mean(large), () => wasmStats.mean(large), 1000);
  compareBenchmark('Mean 100K elements', () => math.mean(xlarge), () => wasmStats.mean(xlarge), 100);
  compareBenchmark('Mean 1M elements', () => math.mean(xxlarge), () => wasmStats.mean(xxlarge), 10);

  // Median
  console.log('--- Median ---');
  compareBenchmark('Median 100 elements', () => math.median(small.slice()), () => wasmStats.median(small.slice()), 10000);
  compareBenchmark('Median 1K elements', () => math.median(medium.slice()), () => wasmStats.median(medium.slice()), 1000);
  compareBenchmark('Median 10K elements', () => math.median(large.slice()), () => wasmStats.median(large.slice()), 100);
  compareBenchmark('Median 100K elements', () => math.median(xlarge.slice()), () => wasmStats.median(xlarge.slice()), 10);

  // Standard Deviation
  console.log('--- Standard Deviation ---');
  compareBenchmark('Std 100 elements', () => math.std(small), () => wasmStats.std(small), 10000);
  compareBenchmark('Std 1K elements', () => math.std(medium), () => wasmStats.std(medium), 1000);
  compareBenchmark('Std 10K elements', () => math.std(large), () => wasmStats.std(large), 1000);
  compareBenchmark('Std 100K elements', () => math.std(xlarge), () => wasmStats.std(xlarge), 100);
  compareBenchmark('Std 1M elements', () => math.std(xxlarge), () => wasmStats.std(xxlarge), 10);

  // Variance
  console.log('--- Variance ---');
  compareBenchmark('Variance 100 elements', () => math.variance(small), () => wasmStats.variance(small), 10000);
  compareBenchmark('Variance 1K elements', () => math.variance(medium), () => wasmStats.variance(medium), 1000);
  compareBenchmark('Variance 10K elements', () => math.variance(large), () => wasmStats.variance(large), 1000);
  compareBenchmark('Variance 100K elements', () => math.variance(xlarge), () => wasmStats.variance(xlarge), 100);
  compareBenchmark('Variance 1M elements', () => math.variance(xxlarge), () => wasmStats.variance(xxlarge), 10);

  // Min
  console.log('--- Min ---');
  compareBenchmark('Min 100 elements', () => math.min(small), () => wasmStats.min(small), 10000);
  compareBenchmark('Min 1K elements', () => math.min(medium), () => wasmStats.min(medium), 10000);
  compareBenchmark('Min 10K elements', () => math.min(large), () => wasmStats.min(large), 1000);
  compareBenchmark('Min 100K elements', () => math.min(xlarge), () => wasmStats.min(xlarge), 100);
  compareBenchmark('Min 1M elements', () => math.min(xxlarge), () => wasmStats.min(xxlarge), 10);

  // Max
  console.log('--- Max ---');
  compareBenchmark('Max 100 elements', () => math.max(small), () => wasmStats.max(small), 10000);
  compareBenchmark('Max 1K elements', () => math.max(medium), () => wasmStats.max(medium), 10000);
  compareBenchmark('Max 10K elements', () => math.max(large), () => wasmStats.max(large), 1000);
  compareBenchmark('Max 100K elements', () => math.max(xlarge), () => wasmStats.max(xlarge), 100);
  compareBenchmark('Max 1M elements', () => math.max(xxlarge), () => wasmStats.max(xxlarge), 10);

  // Sum
  console.log('--- Sum ---');
  compareBenchmark('Sum 100 elements', () => math.sum(small), () => wasmStats.sum(small), 10000);
  compareBenchmark('Sum 1K elements', () => math.sum(medium), () => wasmStats.sum(medium), 10000);
  compareBenchmark('Sum 10K elements', () => math.sum(large), () => wasmStats.sum(large), 1000);
  compareBenchmark('Sum 100K elements', () => math.sum(xlarge), () => wasmStats.sum(xlarge), 100);
  compareBenchmark('Sum 1M elements', () => math.sum(xxlarge), () => wasmStats.sum(xxlarge), 10);

  // Product
  console.log('--- Product ---');
  const smallProd = Array.from({ length: 10 }, () => 1 + Math.random());
  const mediumProd = Array.from({ length: 100 }, () => 1 + Math.random());
  const largeProd = Array.from({ length: 1000 }, () => 1 + Math.random());
  compareBenchmark('Product 10 elements', () => math.prod(smallProd), () => wasmStats.product(smallProd), 10000);
  compareBenchmark('Product 100 elements', () => math.prod(mediumProd), () => wasmStats.product(mediumProd), 10000);
  compareBenchmark('Product 1K elements', () => math.prod(largeProd), () => wasmStats.product(largeProd), 1000);

  // Summary
  console.log('=== Summary ===');
  const avgSpeedup = results.reduce((sum, r) => sum + r.speedup, 0) / results.length;
  console.log(`Average speedup: ${avgSpeedup.toFixed(2)}x`);
  console.log(`Target: 2-5x speedup`);
  console.log(`Status: ${avgSpeedup >= 2 ? '✓ ACHIEVED' : '✗ NOT ACHIEVED'}`);
  console.log();

  // Top performers
  const sorted = results.slice().sort((a, b) => b.speedup - a.speedup);
  console.log('Top 5 speedups:');
  sorted.slice(0, 5).forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.name}: ${r.speedup.toFixed(2)}x`);
  });
  console.log();

  // Slowest
  console.log('Bottom 5 speedups:');
  sorted.slice(-5).reverse().forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.name}: ${r.speedup.toFixed(2)}x`);
  });
}

runBenchmarks().catch(err => {
  console.error('Benchmark error:', err);
  process.exit(1);
});
