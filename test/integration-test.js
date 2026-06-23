/**
 * @file integration-test.js
 * @description Integration smoke test for the MathTS-backed compute engine.
 *
 * Verifies each operation the MCP tools expose produces correct results across
 * small and large inputs. Acceleration tiering (WASM → ComputePool → JS) is
 * handled internally by MathTS, so this no longer asserts which tier ran.
 */
import math from '../dist/math-engine.js';

console.log('=== MCP Server Integration Tests ===\n');

let testsRun = 0;
let testsPassed = 0;
let testsFailed = 0;

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

const approx = (a, b, t = 1e-9) => Math.abs(a - b) <= t * Math.max(1, Math.abs(a), Math.abs(b));
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log('--- Matrix Operations ---');
await asyncTest('matrix multiply (2x2)', async () => {
  const r = math.multiply([[1, 2], [3, 4]], [[5, 6], [7, 8]]);
  if (!eq(r, [[19, 22], [43, 50]])) throw new Error('wrong result: ' + JSON.stringify(r));
});
await asyncTest('matrix multiply (20x20) shape', async () => {
  const n = 20;
  const a = Array.from({ length: n }, () => Array.from({ length: n }, () => Math.random()));
  const r = math.multiply(a, a);
  if (!Array.isArray(r) || r.length !== n || r[0].length !== n) throw new Error('bad shape');
});
await asyncTest('determinant (3x3)', async () => {
  const d = math.det([[1, 2, 3], [4, 5, 6], [7, 8, 10]]);
  if (!approx(d, -3, 1e-6)) throw new Error('det wrong: ' + d);
});
await asyncTest('transpose (array in → array out)', async () => {
  const t = math.transpose([[1, 2], [3, 4]]);
  if (!eq(t, [[1, 3], [2, 4]])) throw new Error('wrong result: ' + JSON.stringify(t));
});

console.log('\n--- Statistics ---');
await asyncTest('mean', async () => {
  if (math.mean([1, 2, 3, 4]) !== 2.5) throw new Error('mean wrong');
});
await asyncTest('min / max', async () => {
  const d = [3, 1, 2];
  if (math.min(d) !== 1 || math.max(d) !== 3) throw new Error('min/max wrong');
});
await asyncTest('variance / std (sample default)', async () => {
  if (!approx(math.variance([2, 4, 6]), 4)) throw new Error('variance wrong: ' + math.variance([2, 4, 6]));
  if (!approx(math.std([2, 4, 6]), 2)) throw new Error('std wrong: ' + math.std([2, 4, 6]));
});
await asyncTest('large mean (1000 elements)', async () => {
  const data = Array.from({ length: 1000 }, () => Math.random());
  const m = math.mean(data);
  if (typeof m !== 'number' || Number.isNaN(m)) throw new Error('mean NaN');
});

console.log('\n--- Symbolic ---');
await asyncTest('evaluate', async () => {
  if (math.evaluate('2^10') !== 1024) throw new Error('evaluate wrong');
});
await asyncTest('simplify', async () => {
  if (String(math.simplify('2x + 3x')) !== '5 * x') throw new Error('simplify: ' + math.simplify('2x + 3x'));
});
await asyncTest('derivative', async () => {
  if (String(math.derivative('x^2', 'x')) !== '2 * x') throw new Error('derivative wrong');
});
await asyncTest('unit conversion', async () => {
  if (math.unit('5 cm').to('m').toString() !== '0.05 m') throw new Error('unit wrong');
});

console.log('\n--- Test Results ---');
console.log(`Total: ${testsRun}  Passed: ${testsPassed}  Failed: ${testsFailed}`);

if (testsFailed === 0) {
  console.log('\n✓ All integration tests passed!');
  process.exit(0);
} else {
  console.error(`\n✗ ${testsFailed} tests failed`);
  process.exit(1);
}
