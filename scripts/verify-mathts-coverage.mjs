// One-off discovery: confirm mathts-compat covers the functions math-mcp uses,
// and probe whether matrix ops self-accelerate. Drives Tasks 2-3.
import { create, all } from '@danielsimonjr/mathts-compat';

const math = create(all);

const fns = [
  'parse', 'evaluate', 'simplify', 'derivative', 'format', 'unit',
  'multiply', 'inv', 'det', 'transpose', 'eigs', 'add', 'subtract',
  'mean', 'median', 'mode', 'std', 'variance', 'min', 'max', 'sum', 'prod',
];

const present = fns.filter((f) => typeof math[f] === 'function');
const missing = fns.filter((f) => typeof math[f] !== 'function');

console.log('PRESENT (' + present.length + '/' + fns.length + '):', present.join(', '));
console.log('MISSING:', missing.length ? missing.join(', ') : '(none)');

// Quick behavioral spot-checks against known answers (compat fidelity)
const checks = [];
const tryCheck = (name, fn) => {
  try { checks.push(name + '=' + JSON.stringify(fn())); }
  catch (e) { checks.push(name + ' ERROR:' + e.message); }
};
tryCheck('evaluate(2^10)', () => math.evaluate('2^10'));
tryCheck('simplify(2x+3x)', () => String(math.simplify('2x+3x')));
tryCheck('derivative(x^2,x)', () => String(math.derivative('x^2', 'x')));
tryCheck('det[[1,2],[3,4]]', () => math.det([[1, 2], [3, 4]]));
tryCheck('mean[1,2,3,4]', () => math.mean([1, 2, 3, 4]));
tryCheck('std[2,4,6]', () => math.std([2, 4, 6]));
tryCheck('unit 5cm->m', () => math.unit('5 cm').to('m').toString());
console.log('CHECKS:', checks.join(' | '));

// accel probe
const big = Array.from({ length: 128 }, () => Array.from({ length: 128 }, () => Math.random()));
const t0 = performance.now();
math.multiply(big, big);
console.log('matmul128 ms:', (performance.now() - t0).toFixed(1));
