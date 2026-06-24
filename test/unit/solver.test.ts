/**
 * @file solver.test.ts
 * @description Unit tests for the self-contained equation solver (handleSolve).
 *
 * Covers the analytic path (linear / quadratic / cubic, real + complex roots),
 * the numeric fallback (quartic, transcendental, root capping), and the
 * degenerate cases (identity, no solution, multivariable rejection).
 *
 * @since 4.1.0
 */

import { describe, it, expect } from 'vitest';
import { handleSolve } from '../../src/tool-handlers.js';

async function solve(equation: string, variable = 'x'): Promise<string> {
  const res = await handleSolve({ equation, variable });
  expect(res.isError).toBe(false);
  // successResponse wraps the payload as JSON text: { "result": "..." }.
  return JSON.parse(res.content[0].text as string).result as string;
}

describe('handleSolve — analytic (polynomial degree <= 3)', () => {
  it('solves linear equations', async () => {
    expect(await solve('x + 5 = 10')).toBe('Solution: x = 5');
    expect(await solve('2*x - 10 = 0')).toBe('Solution: x = 5');
  });

  it('solves quadratics with two real roots (sorted ascending)', async () => {
    expect(await solve('x^2 - 4 = 0')).toBe('Solutions: x = -2, x = 2');
  });

  it('solves quadratics with a repeated real root (deduped)', async () => {
    expect(await solve('x^2 - 2*x + 1 = 0')).toBe('Solution: x = 1');
  });

  it('solves quadratics with complex conjugate roots', async () => {
    expect(await solve('x^2 + 1 = 0')).toBe('Solutions: x = i, x = -i');
    expect(await solve('x^2 - 2*x + 2 = 0')).toBe('Solutions: x = 1 + i, x = 1 - i');
  });

  it('solves cubics with three distinct real roots', async () => {
    const text = await solve('x^3 - 6*x^2 + 11*x - 6 = 0');
    for (const root of ['x = 1', 'x = 2', 'x = 3']) expect(text).toContain(root);
  });

  it('solves cubics with one real and two complex roots', async () => {
    const text = await solve('x^3 - 8 = 0');
    expect(text).toContain('x = 2');
    expect(text).toContain('i'); // -1 ± √3 i
  });
});

describe('handleSolve — numeric fallback', () => {
  it('finds all real roots of a quartic', async () => {
    const text = await solve('x^4 - 5*x^2 + 4 = 0');
    expect(text).toContain('numeric');
    for (const root of ['-2', '-1', '1', '2']) {
      expect(text).toMatch(new RegExp(`≈ ${root}\\b`));
    }
  });

  it('finds a transcendental root (ln 2)', async () => {
    const text = await solve('exp(x) - 2 = 0');
    expect(text).toMatch(/≈ 0\.69314/);
  });

  it('caps the number of reported roots for periodic equations', async () => {
    const text = await solve('cos(x) = 0');
    expect(text).toMatch(/and \d+ more/);
    // At most 10 roots reported.
    expect((text.match(/≈/g) ?? []).length).toBeLessThanOrEqual(10);
  });
});

describe('handleSolve — degenerate cases', () => {
  it('reports an identity', async () => {
    expect(await solve('x = x')).toMatch(/identity/i);
  });

  it('reports no solution for a contradiction', async () => {
    expect(await solve('0*x + 1 = 0')).toMatch(/no solution/i);
  });

  it('rejects equations with extra unknowns', async () => {
    const text = await solve('a*x + b = 0');
    expect(text).toMatch(/unknowns other than 'x'/);
  });

  it('requires exactly one equals sign', async () => {
    await expect(handleSolve({ equation: 'x + 1', variable: 'x' })).rejects.toThrow();
    await expect(handleSolve({ equation: 'x = 1 = 2', variable: 'x' })).rejects.toThrow();
  });
});
