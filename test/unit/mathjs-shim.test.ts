/**
 * @file mathjs-shim.test.ts
 * @description Sanity tests for the mathjs-shim ESM unwrapping layer.
 *
 * The shim resolves the local fork's default-vs-namespace export shape.
 * If it ever stops returning the configured math instance, every src
 * file importing from it would silently lose access to parse / simplify /
 * det / etc. — manifesting as "is not a function" runtime errors.
 *
 * @since 3.5.0
 */

import { describe, it, expect } from 'vitest';
import math from '../../src/mathjs-shim.js';

describe('mathjs-shim', () => {
  it('exposes the core mathjs functions used by tool handlers', () => {
    // If the shim regresses, every one of these flips to undefined.
    expect(typeof math.parse).toBe('function');
    expect(typeof math.simplify).toBe('function');
    expect(typeof math.derivative).toBe('function');
    expect(typeof math.evaluate).toBe('function');
    expect(typeof math.format).toBe('function');
  });

  it('exposes matrix functions used by AccelerationRouter mathjs fallbacks', () => {
    expect(typeof math.multiply).toBe('function');
    expect(typeof math.add).toBe('function');
    expect(typeof math.subtract).toBe('function');
    expect(typeof math.det).toBe('function');
    expect(typeof math.transpose).toBe('function');
  });

  it('exposes statistics functions used by the statistics tool', () => {
    expect(typeof math.mean).toBe('function');
    expect(typeof math.median).toBe('function');
    expect(typeof math.mode).toBe('function');
    expect(typeof math.std).toBe('function');
    expect(typeof math.variance).toBe('function');
    expect(typeof math.min).toBe('function');
    expect(typeof math.max).toBe('function');
    expect(typeof math.sum).toBe('function');
    expect(typeof math.prod).toBe('function');
  });

  it('exposes unit() for unit conversion', () => {
    expect(typeof math.unit).toBe('function');
  });

  it('produces a numerically correct result through a typical tool path', () => {
    // Smoke: parse → compile → evaluate. If the shim returned an
    // unconfigured instance, parse() would still exist but produce
    // garbage. Asserting on the value forces end-to-end correctness.
    const node = math.parse('2 + 3 * 4');
    const result = node.compile().evaluate({});
    expect(result).toBe(14);
  });
});
