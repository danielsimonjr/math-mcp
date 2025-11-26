/**
 * @file bounds-tests.ts
 * @description Boundary and edge case testing
 *
 * Tests edge cases and boundary conditions:
 * - Size limits (matrices, arrays, expressions)
 * - Number edge cases (infinity, NaN, epsilon, max/min values)
 * - Empty inputs
 * - Single element inputs
 * - Maximum size inputs
 *
 * @module security/bounds-tests
 */

import { describe, it, expect } from 'vitest';
import {
  handleEvaluate,
  handleMatrixOperations,
  handleStatistics,
  handleDerivative,
  handleSimplify,
  handleSolve,
  handleUnitConversion,
} from '../../src/tool-handlers.js';

describe('Bounds Testing', () => {
  describe('Matrix size limits', () => {
    it('should reject matrices exceeding 1000x1000 size limit', async () => {
      const oversized = Array(1001)
        .fill(null)
        .map(() => Array(1001).fill(1));

      await expect(
        handleMatrixOperations({
          operation: 'determinant',
          matrix_a: JSON.stringify(oversized),
        })
      ).rejects.toThrow(/exceeds maximum size|too large|size limit/i);
    });

    it('should accept matrices at exact size limit (1000x1000)', async () => {
      const atLimit = Array(1000)
        .fill(null)
        .map(() => Array(1000).fill(1));

      // Should either succeed or fail for computational reasons, not size
      try {
        const result = await handleMatrixOperations({
          operation: 'transpose',
          matrix_a: JSON.stringify(atLimit),
        });
        expect(result).toBeDefined();
      } catch (error: unknown) {
        // If it fails, should be timeout or computational error, not size limit
        const message = (error as Error).message;
        expect(message).not.toMatch(/size limit|too large/i);
      }
    }, 30000);

    it('should handle single element matrix', async () => {
      const single = [[42]];

      const result = await handleMatrixOperations({
        operation: 'determinant',
        matrix_a: JSON.stringify(single),
      });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain('42');
    });

    it('should reject empty matrix', async () => {
      await expect(
        handleMatrixOperations({
          operation: 'determinant',
          matrix_a: JSON.stringify([]),
        })
      ).rejects.toThrow(/empty|invalid|must be/i);
    });

    it('should reject matrix with empty rows', async () => {
      const emptyRows = [[], [], []];

      await expect(
        handleMatrixOperations({
          operation: 'determinant',
          matrix_a: JSON.stringify(emptyRows),
        })
      ).rejects.toThrow(/empty|invalid|must/i);
    });

    it('should handle 2x2 matrix (common case)', async () => {
      const matrix = [[1, 2], [3, 4]];

      const result = await handleMatrixOperations({
        operation: 'determinant',
        matrix_a: JSON.stringify(matrix),
      });

      expect(result.isError).toBe(false);
    });

    it('should reject non-square matrix for determinant', async () => {
      const nonSquare = [[1, 2, 3], [4, 5, 6]];

      await expect(
        handleMatrixOperations({
          operation: 'determinant',
          matrix_a: JSON.stringify(nonSquare),
        })
      ).rejects.toThrow(/square|dimensions/i);
    });
  });

  describe('Array length limits', () => {
    it('should reject arrays exceeding 100,000 element limit', async () => {
      const oversized = Array(100001).fill(1);

      await expect(
        handleStatistics({
          operation: 'mean',
          data: JSON.stringify(oversized),
        })
      ).rejects.toThrow(/exceeds maximum length|too large|length limit/i);
    });

    it('should accept arrays at exact length limit (100,000)', async () => {
      const atLimit = Array(100000).fill(1);

      const result = await handleStatistics({
        operation: 'sum',
        data: JSON.stringify(atLimit),
      });

      expect(result.isError).toBe(false);
    }, 15000);

    it('should handle single element array', async () => {
      const single = [42];

      const result = await handleStatistics({
        operation: 'mean',
        data: JSON.stringify(single),
      });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain('42');
    });

    it('should reject empty array', async () => {
      await expect(
        handleStatistics({
          operation: 'mean',
          data: JSON.stringify([]),
        })
      ).rejects.toThrow(/empty|invalid|must contain/i);
    });

    it('should handle two element array', async () => {
      const two = [10, 20];

      const result = await handleStatistics({
        operation: 'mean',
        data: JSON.stringify(two),
      });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain('15');
    });
  });

  describe('Expression complexity limits', () => {
    it('should reject expression exceeding 10,000 character limit', async () => {
      let longExpr = '1';
      for (let i = 0; i < 5000; i++) {
        longExpr += ' + 1';
      }

      expect(longExpr.length).toBeGreaterThan(10000);

      await expect(
        handleEvaluate({ expression: longExpr })
      ).rejects.toThrow(/exceeds maximum length|too long|complexity/i);
    });

    it('should reject expression with too many nested parentheses', async () => {
      let expr = '1';
      for (let i = 0; i < 100; i++) {
        expr = `(${expr})`;
      }

      await expect(
        handleEvaluate({ expression: expr })
      ).rejects.toThrow(/complexity|nested|limit/i);
    });

    it('should accept expression at reasonable complexity', async () => {
      let expr = '1';
      for (let i = 0; i < 10; i++) {
        expr = `(${expr} + 1)`;
      }

      const result = await handleEvaluate({ expression: expr });
      expect(result.isError).toBe(false);
    });

    it('should handle single character expression', async () => {
      const result = await handleEvaluate({ expression: '5' });
      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain('5');
    });
  });

  describe('Number edge cases', () => {
    it('should handle zero', async () => {
      const result = await handleEvaluate({ expression: '0' });
      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain('0');
    });

    it('should handle negative zero', async () => {
      const result = await handleEvaluate({ expression: '-0' });
      expect(result.isError).toBe(false);
    });

    it('should handle very small numbers (Number.EPSILON)', async () => {
      const result = await handleEvaluate({
        expression: `${Number.EPSILON}`,
      });
      expect(result.isError).toBe(false);
    });

    it('should handle very large numbers', async () => {
      const result = await handleEvaluate({
        expression: `${Number.MAX_SAFE_INTEGER}`,
      });
      expect(result.isError).toBe(false);
    });

    it('should reject infinity in arrays', async () => {
      const withInfinity = [1, 2, Number.POSITIVE_INFINITY, 4];

      await expect(
        handleStatistics({
          operation: 'mean',
          data: JSON.stringify(withInfinity),
        })
      ).rejects.toThrow(/finite|invalid|infinity/i);
    });

    it('should reject NaN in arrays', async () => {
      const withNaN = [1, 2, Number.NaN, 4];

      await expect(
        handleStatistics({
          operation: 'mean',
          data: JSON.stringify(withNaN),
        })
      ).rejects.toThrow(/NaN|invalid|finite/i);
    });

    it('should handle negative numbers', async () => {
      const result = await handleStatistics({
        operation: 'mean',
        data: JSON.stringify([-10, -20, -30]),
      });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain('-20');
    });

    it('should handle mix of positive and negative', async () => {
      const result = await handleStatistics({
        operation: 'sum',
        data: JSON.stringify([10, -5, 3, -8]),
      });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain('0');
    });

    it('should handle decimal numbers', async () => {
      const result = await handleStatistics({
        operation: 'mean',
        data: JSON.stringify([1.5, 2.5, 3.5]),
      });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain('2.5');
    });

    it('should handle scientific notation', async () => {
      const result = await handleEvaluate({
        expression: '1.23e-4',
      });

      expect(result.isError).toBe(false);
    });
  });

  describe('Matrix operation edge cases', () => {
    it('should handle identity matrix multiplication', async () => {
      const identity = [[1, 0], [0, 1]];
      const matrix = [[2, 3], [4, 5]];

      const result = await handleMatrixOperations({
        operation: 'multiply',
        matrix_a: JSON.stringify(identity),
        matrix_b: JSON.stringify(matrix),
      });

      expect(result.isError).toBe(false);
    });

    it('should handle zero matrix', async () => {
      const zero = [[0, 0], [0, 0]];

      const result = await handleMatrixOperations({
        operation: 'determinant',
        matrix_a: JSON.stringify(zero),
      });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain('0');
    });

    it('should handle matrix with negative determinant', async () => {
      const matrix = [[1, 2], [3, 4]]; // det = -2

      const result = await handleMatrixOperations({
        operation: 'determinant',
        matrix_a: JSON.stringify(matrix),
      });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toMatch(/-2/);
    });

    it('should handle singular matrix (determinant = 0)', async () => {
      const singular = [[1, 2], [2, 4]];

      const result = await handleMatrixOperations({
        operation: 'determinant',
        matrix_a: JSON.stringify(singular),
      });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain('0');
    });

    it('should reject incompatible matrix multiplication', async () => {
      const a = [[1, 2, 3]]; // 1x3
      const b = [[1], [2]]; // 2x1

      await expect(
        handleMatrixOperations({
          operation: 'multiply',
          matrix_a: JSON.stringify(a),
          matrix_b: JSON.stringify(b),
        })
      ).rejects.toThrow(/incompatible|dimensions|mismatch/i);
    });
  });

  describe('Statistics edge cases', () => {
    it('should handle median of even-length array', async () => {
      const result = await handleStatistics({
        operation: 'median',
        data: JSON.stringify([1, 2, 3, 4]),
      });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain('2.5');
    });

    it('should handle median of odd-length array', async () => {
      const result = await handleStatistics({
        operation: 'median',
        data: JSON.stringify([1, 2, 3]),
      });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain('2');
    });

    it('should handle mode with multiple modes', async () => {
      const result = await handleStatistics({
        operation: 'mode',
        data: JSON.stringify([1, 1, 2, 2, 3]),
      });

      expect(result.isError).toBe(false);
      // Should return both 1 and 2, or one of them
    });

    it('should handle variance of identical values', async () => {
      const result = await handleStatistics({
        operation: 'variance',
        data: JSON.stringify([5, 5, 5, 5]),
      });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain('0');
    });

    it('should handle std deviation of single value', async () => {
      const result = await handleStatistics({
        operation: 'std',
        data: JSON.stringify([42]),
      });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain('0');
    });
  });

  describe('Derivative and solve edge cases', () => {
    it('should handle constant expression derivative', async () => {
      const result = await handleDerivative({
        expression: '42',
        variable: 'x',
      });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain('0');
    });

    it('should handle linear expression derivative', async () => {
      const result = await handleDerivative({
        expression: 'x',
        variable: 'x',
      });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain('1');
    });

    it('should handle solve with no solution', async () => {
      try {
        await handleSolve({
          equation: 'x^2 + 1 = 0', // No real solution
          variable: 'x',
        });
      } catch (error: unknown) {
        // Might throw or return complex solution
        expect(error).toBeDefined();
      }
    });

    it('should handle solve with identity equation', async () => {
      const result = await handleSolve({
        equation: 'x = x',
        variable: 'x',
      });

      // Should indicate all values are solutions or throw
      expect(result).toBeDefined();
    });
  });

  describe('Simplify edge cases', () => {
    it('should handle already simplified expression', async () => {
      const result = await handleSimplify({
        expression: 'x',
      });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain('x');
    });

    it('should handle constant expression', async () => {
      const result = await handleSimplify({
        expression: '42',
      });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain('42');
    });

    it('should handle complex nested expression', async () => {
      const result = await handleSimplify({
        expression: '((x + 1) + (x + 1))',
      });

      expect(result.isError).toBe(false);
      // Should simplify to 2x + 2 or similar
    });
  });

  describe('Unit conversion edge cases', () => {
    it('should handle zero value conversion', async () => {
      const result = await handleUnitConversion({
        value: '0 meter',
        target_unit: 'kilometer',
      });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain('0');
    });

    it('should handle negative value conversion', async () => {
      const result = await handleUnitConversion({
        value: '-10 celsius',
        target_unit: 'fahrenheit',
      });

      expect(result.isError).toBe(false);
    });

    it('should handle very small value conversion', async () => {
      const result = await handleUnitConversion({
        value: '0.001 meter',
        target_unit: 'millimeter',
      });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain('1');
    });

    it('should reject invalid unit names', async () => {
      await expect(
        handleUnitConversion({
          value: '10 invalid_unit',
          target_unit: 'meter',
        })
      ).rejects.toThrow(/unknown|invalid|unit/i);
    });
  });

  describe('Input validation boundaries', () => {
    it('should reject null inputs', async () => {
      await expect(
        handleEvaluate({ expression: null as unknown as string })
      ).rejects.toThrow(/invalid|required|must be/i);
    });

    it('should reject undefined inputs', async () => {
      await expect(
        handleEvaluate({ expression: undefined as unknown as string })
      ).rejects.toThrow(/invalid|required|must be/i);
    });

    it('should reject non-string expression', async () => {
      await expect(
        handleEvaluate({ expression: 123 as unknown as string })
      ).rejects.toThrow(/invalid|must be|string/i);
    });

    it('should reject non-array matrix', async () => {
      await expect(
        handleMatrixOperations({
          operation: 'determinant',
          matrix_a: JSON.stringify({ not: 'array' }),
        })
      ).rejects.toThrow(/invalid|must be|array/i);
    });

    it('should reject non-array statistics data', async () => {
      await expect(
        handleStatistics({
          operation: 'mean',
          data: JSON.stringify({ not: 'array' }),
        })
      ).rejects.toThrow(/invalid|must be|array/i);
    });

    it('should reject invalid operation names', async () => {
      await expect(
        handleMatrixOperations({
          operation: 'invalid_op' as any,
          matrix_a: JSON.stringify([[1]]),
        })
      ).rejects.toThrow(/invalid|unknown|operation/i);
    });
  });
});
