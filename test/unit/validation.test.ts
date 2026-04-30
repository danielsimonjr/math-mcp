/**
 * @file validation.test.ts
 * @description Unit tests for validation module
 *
 * Tests all input validation functions including:
 * - JSON parsing (safeJsonParse)
 * - Matrix validation (validateMatrix, validateSquareMatrix, validateMatrixSize)
 * - Matrix compatibility checking
 * - Number array validation
 * - Expression validation
 * - Variable and scope validation
 * - Enum validation
 *
 * @since 3.1.1
 */

import { describe, it, expect } from 'vitest';
import {
  LIMITS,
  safeJsonParse,
  validateMatrix,
  validateSquareMatrix,
  validateMatrixSize,
  validateMatrixCompatibility,
  validateNumberArray,
  validateArrayLength,
  validateExpression,
  validateVariableName,
} from '../../src/validation.js';
import { ValidationError, SizeLimitError, ComplexityError } from '../../src/errors.js';

describe('validation', () => {
  describe('LIMITS constants', () => {
    it('should define all limit constants', () => {
      expect(LIMITS.MAX_MATRIX_SIZE).toBeDefined();
      expect(LIMITS.MAX_ARRAY_LENGTH).toBeDefined();
      expect(LIMITS.MAX_EXPRESSION_LENGTH).toBeDefined();
      expect(LIMITS.MAX_NESTING_DEPTH).toBeDefined();
      expect(LIMITS.MAX_VARIABLE_NAME_LENGTH).toBeDefined();
      expect(LIMITS.MAX_SCOPE_VARIABLES).toBeDefined();
    });

    it('should have reasonable values', () => {
      expect(LIMITS.MAX_MATRIX_SIZE).toBe(1000);
      expect(LIMITS.MAX_ARRAY_LENGTH).toBe(100000);
      expect(LIMITS.MAX_EXPRESSION_LENGTH).toBe(10000);
      expect(LIMITS.MAX_NESTING_DEPTH).toBe(50);
      expect(LIMITS.MAX_VARIABLE_NAME_LENGTH).toBe(100);
      expect(LIMITS.MAX_SCOPE_VARIABLES).toBe(100);
    });
  });

  describe('safeJsonParse', () => {
    it('should parse valid JSON', () => {
      const result = safeJsonParse('{"a":1,"b":2}', 'test');
      expect(result).toEqual({ a: 1, b: 2 });
    });

    it('should parse JSON arrays', () => {
      const result = safeJsonParse('[1,2,3,4,5]', 'test');
      expect(result).toEqual([1, 2, 3, 4, 5]);
    });

    it('should parse JSON numbers', () => {
      const result = safeJsonParse('42', 'test');
      expect(result).toBe(42);
    });

    it('should parse JSON strings', () => {
      const result = safeJsonParse('"hello"', 'test');
      expect(result).toBe('hello');
    });

    it('should throw ValidationError for invalid JSON', () => {
      expect(() => safeJsonParse('invalid json', 'test')).toThrow(ValidationError);
      expect(() => safeJsonParse('invalid json', 'test')).toThrow(/Invalid JSON/);
    });

    it('should throw ValidationError for non-string input', () => {
      expect(() => safeJsonParse(123 as any, 'test')).toThrow(ValidationError);
      expect(() => safeJsonParse(123 as any, 'test')).toThrow(/must be a string/);
    });

    it('should throw ValidationError for empty string', () => {
      expect(() => safeJsonParse('', 'test')).toThrow(ValidationError);
      expect(() => safeJsonParse('', 'test')).toThrow(/cannot be empty/);
    });

    it('should throw ValidationError for whitespace-only string', () => {
      expect(() => safeJsonParse('   ', 'test')).toThrow(ValidationError);
      expect(() => safeJsonParse('   ', 'test')).toThrow(/cannot be empty/);
    });

    it('should include context in error messages', () => {
      try {
        safeJsonParse('invalid', 'matrix_a');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as Error).message).toContain('matrix_a');
      }
    });

    it('should handle nested objects', () => {
      const result = safeJsonParse('{"a":{"b":{"c":1}}}', 'test');
      expect(result).toEqual({ a: { b: { c: 1 } } });
    });
  });

  describe('validateMatrix', () => {
    it('should accept valid 2x2 matrix', () => {
      const result = validateMatrix([[1, 2], [3, 4]], 'matrix');
      expect(result).toEqual([[1, 2], [3, 4]]);
    });

    it('should accept valid 3x3 matrix', () => {
      const result = validateMatrix([[1, 2, 3], [4, 5, 6], [7, 8, 9]], 'matrix');
      expect(result).toEqual([[1, 2, 3], [4, 5, 6], [7, 8, 9]]);
    });

    it('should accept rectangular matrices', () => {
      const result = validateMatrix([[1, 2, 3], [4, 5, 6]], 'matrix');
      expect(result).toEqual([[1, 2, 3], [4, 5, 6]]);
    });

    it('should throw for non-array input', () => {
      expect(() => validateMatrix('not an array', 'matrix')).toThrow(ValidationError);
      expect(() => validateMatrix('not an array', 'matrix')).toThrow(/must be an array/);
    });

    it('should throw for empty array', () => {
      expect(() => validateMatrix([], 'matrix')).toThrow(ValidationError);
      expect(() => validateMatrix([], 'matrix')).toThrow(/cannot be empty/);
    });

    it('should throw for 1D array (not 2D)', () => {
      expect(() => validateMatrix([1, 2, 3], 'matrix')).toThrow(ValidationError);
      expect(() => validateMatrix([1, 2, 3], 'matrix')).toThrow(/must be a 2D array/);
    });

    it('should throw for empty rows', () => {
      expect(() => validateMatrix([[]], 'matrix')).toThrow(ValidationError);
      expect(() => validateMatrix([[]], 'matrix')).toThrow(/rows cannot be empty/);
    });

    it('should throw for jagged arrays (inconsistent row lengths)', () => {
      expect(() => validateMatrix([[1, 2], [3, 4, 5]], 'matrix')).toThrow(ValidationError);
      expect(() => validateMatrix([[1, 2], [3, 4, 5]], 'matrix')).toThrow(/rows must have equal length/);
    });

    it('should throw for non-numeric values', () => {
      expect(() => validateMatrix([[1, 2], [3, 'x']], 'matrix')).toThrow(ValidationError);
      expect(() => validateMatrix([[1, 2], [3, 'x']], 'matrix')).toThrow(/non-numeric/);
    });

    it('should throw for NaN values', () => {
      expect(() => validateMatrix([[1, 2], [3, NaN]], 'matrix')).toThrow(ValidationError);
      expect(() => validateMatrix([[1, 2], [3, NaN]], 'matrix')).toThrow(/non-finite/);
    });

    it('should throw for Infinity values', () => {
      expect(() => validateMatrix([[1, 2], [3, Infinity]], 'matrix')).toThrow(ValidationError);
      expect(() => validateMatrix([[1, 2], [3, Infinity]], 'matrix')).toThrow(/non-finite/);
    });

    it('should accept negative numbers', () => {
      const result = validateMatrix([[-1, -2], [-3, -4]], 'matrix');
      expect(result).toEqual([[-1, -2], [-3, -4]]);
    });

    it('should accept zero values', () => {
      const result = validateMatrix([[0, 0], [0, 0]], 'matrix');
      expect(result).toEqual([[0, 0], [0, 0]]);
    });

    it('should accept decimal values', () => {
      const result = validateMatrix([[1.5, 2.5], [3.5, 4.5]], 'matrix');
      expect(result).toEqual([[1.5, 2.5], [3.5, 4.5]]);
    });
  });

  describe('validateSquareMatrix', () => {
    it('should accept square matrices', () => {
      const result = validateSquareMatrix([[1, 2], [3, 4]], 'matrix');
      expect(result).toEqual([[1, 2], [3, 4]]);
    });

    it('should accept 1x1 matrix', () => {
      const result = validateSquareMatrix([[1]], 'matrix');
      expect(result).toEqual([[1]]);
    });

    it('should accept 3x3 matrix', () => {
      const result = validateSquareMatrix([[1, 2, 3], [4, 5, 6], [7, 8, 9]], 'matrix');
      expect(result).toEqual([[1, 2, 3], [4, 5, 6], [7, 8, 9]]);
    });

    it('should throw for non-square matrices', () => {
      expect(() => validateSquareMatrix([[1, 2, 3], [4, 5, 6]], 'matrix')).toThrow(ValidationError);
      expect(() => validateSquareMatrix([[1, 2, 3], [4, 5, 6]], 'matrix')).toThrow(/must be square/);
    });

    it('should include dimensions in error message', () => {
      try {
        validateSquareMatrix([[1, 2, 3], [4, 5, 6]], 'matrix');
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as Error).message).toContain('2×3');
      }
    });
  });

  describe('validateMatrixSize', () => {
    it('should accept small matrices', () => {
      const result = validateMatrixSize([[1, 2], [3, 4]], 'matrix');
      expect(result).toEqual([[1, 2], [3, 4]]);
    });

    it('should accept matrices at the limit', () => {
      const matrix = Array(1000).fill(0).map(() => Array(1000).fill(1));
      const result = validateMatrixSize(matrix, 'matrix');
      expect(result).toBe(matrix);
    });

    it('should throw SizeLimitError for matrices exceeding row limit', () => {
      const matrix = Array(1001).fill(0).map(() => Array(10).fill(1));
      expect(() => validateMatrixSize(matrix, 'matrix')).toThrow(SizeLimitError);
      expect(() => validateMatrixSize(matrix, 'matrix')).toThrow(/exceeds maximum/);
    });

    it('should throw SizeLimitError for matrices exceeding column limit', () => {
      const matrix = Array(10).fill(0).map(() => Array(1001).fill(1));
      expect(() => validateMatrixSize(matrix, 'matrix')).toThrow(SizeLimitError);
      expect(() => validateMatrixSize(matrix, 'matrix')).toThrow(/exceeds maximum/);
    });

    it('should throw SizeLimitError for matrices exceeding both limits', () => {
      const matrix = Array(2000).fill(0).map(() => Array(2000).fill(1));
      expect(() => validateMatrixSize(matrix, 'matrix')).toThrow(SizeLimitError);
    });

    it('should include dimensions in error message', () => {
      const matrix = Array(1001).fill(0).map(() => Array(1001).fill(1));
      try {
        validateMatrixSize(matrix, 'matrix');
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as Error).message).toContain('1001×1001');
        expect((error as Error).message).toContain('1000×1000');
      }
    });
  });

  describe('validateMatrixCompatibility', () => {
    describe('multiply operation', () => {
      it('should accept compatible matrices for multiplication', () => {
        const a = [[1, 2, 3]]; // 1x3
        const b = [[1], [2], [3]]; // 3x1
        expect(() => validateMatrixCompatibility(a, b, 'multiply')).not.toThrow();
      });

      it('should accept square matrices for multiplication', () => {
        const a = [[1, 2], [3, 4]];
        const b = [[1, 2], [3, 4]];
        expect(() => validateMatrixCompatibility(a, b, 'multiply')).not.toThrow();
      });

      it('should throw for incompatible matrices', () => {
        const a = [[1, 2]]; // 1x2
        const b = [[1, 2, 3]]; // 1x3 (should be 2xN)
        expect(() => validateMatrixCompatibility(a, b, 'multiply')).toThrow(ValidationError);
        expect(() => validateMatrixCompatibility(a, b, 'multiply')).toThrow(/cannot multiply/i);
      });

      it('should include dimensions in error message', () => {
        const a = [[1, 2]]; // 1x2
        const b = [[1, 2, 3]]; // 1x3
        try {
          validateMatrixCompatibility(a, b, 'multiply');
          expect.fail('Should have thrown');
        } catch (error) {
          expect((error as Error).message).toContain('2');
          expect((error as Error).message).toContain('1');
        }
      });
    });

    describe('add/subtract operations', () => {
      it('should accept same-sized matrices for addition', () => {
        const a = [[1, 2], [3, 4]];
        const b = [[5, 6], [7, 8]];
        expect(() => validateMatrixCompatibility(a, b, 'add')).not.toThrow();
      });

      it('should accept same-sized matrices for subtraction', () => {
        const a = [[1, 2], [3, 4]];
        const b = [[5, 6], [7, 8]];
        expect(() => validateMatrixCompatibility(a, b, 'subtract')).not.toThrow();
      });

      it('should throw for different-sized matrices in addition', () => {
        const a = [[1, 2], [3, 4]]; // 2x2
        const b = [[1, 2, 3]]; // 1x3
        expect(() => validateMatrixCompatibility(a, b, 'add')).toThrow(ValidationError);
        expect(() => validateMatrixCompatibility(a, b, 'add')).toThrow(/Cannot add/);
      });

      it('should throw for different-sized matrices in subtraction', () => {
        const a = [[1, 2], [3, 4]]; // 2x2
        const b = [[1, 2, 3]]; // 1x3
        expect(() => validateMatrixCompatibility(a, b, 'subtract')).toThrow(ValidationError);
        expect(() => validateMatrixCompatibility(a, b, 'subtract')).toThrow(/Cannot subtract/);
      });
    });

    it('should throw for unknown operation', () => {
      const a = [[1, 2]];
      const b = [[1, 2]];
      expect(() => validateMatrixCompatibility(a, b, 'unknown')).toThrow(ValidationError);
      expect(() => validateMatrixCompatibility(a, b, 'unknown')).toThrow(/Unknown matrix operation/);
    });
  });

  describe('validateNumberArray', () => {
    it('should accept valid number arrays', () => {
      const result = validateNumberArray([1, 2, 3, 4, 5], 'data');
      expect(result).toEqual([1, 2, 3, 4, 5]);
    });

    it('should accept arrays with decimals', () => {
      const result = validateNumberArray([1.5, 2.5, 3.5], 'data');
      expect(result).toEqual([1.5, 2.5, 3.5]);
    });

    it('should accept arrays with negative numbers', () => {
      const result = validateNumberArray([-1, -2, -3], 'data');
      expect(result).toEqual([-1, -2, -3]);
    });

    it('should accept arrays with zeros', () => {
      const result = validateNumberArray([0, 0, 0], 'data');
      expect(result).toEqual([0, 0, 0]);
    });

    it('should throw for non-array input', () => {
      expect(() => validateNumberArray('not an array', 'data')).toThrow(ValidationError);
      expect(() => validateNumberArray('not an array', 'data')).toThrow(/must be an array/);
    });

    it('should throw for empty array', () => {
      expect(() => validateNumberArray([], 'data')).toThrow(ValidationError);
      expect(() => validateNumberArray([], 'data')).toThrow(/cannot be empty/);
    });

    it('should throw for arrays with non-numeric values', () => {
      expect(() => validateNumberArray([1, 2, 'x', 4], 'data')).toThrow(ValidationError);
      expect(() => validateNumberArray([1, 2, 'x', 4], 'data')).toThrow(/non-numeric/);
    });

    it('should throw for arrays with NaN', () => {
      expect(() => validateNumberArray([1, 2, NaN], 'data')).toThrow(ValidationError);
      expect(() => validateNumberArray([1, 2, NaN], 'data')).toThrow(/non-finite/);
    });

    it('should throw for arrays with Infinity', () => {
      expect(() => validateNumberArray([1, 2, Infinity], 'data')).toThrow(ValidationError);
      expect(() => validateNumberArray([1, 2, Infinity], 'data')).toThrow(/non-finite/);
    });

    it('should include index in error message', () => {
      try {
        validateNumberArray([1, 2, 'x', 4], 'data');
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as Error).message).toContain('index 2');
      }
    });
  });

  describe('validateArrayLength', () => {
    it('should accept small arrays', () => {
      const result = validateArrayLength([1, 2, 3, 4, 5], 'data');
      expect(result).toEqual([1, 2, 3, 4, 5]);
    });

    it('should accept arrays at the limit', () => {
      const array = Array(100000).fill(1);
      const result = validateArrayLength(array, 'data');
      expect(result).toBe(array);
    });

    it('should throw SizeLimitError for arrays exceeding limit', () => {
      const array = Array(100001).fill(1);
      expect(() => validateArrayLength(array, 'data')).toThrow(SizeLimitError);
      expect(() => validateArrayLength(array, 'data')).toThrow(/exceeds maximum/);
    });

    it('should include length in error message', () => {
      const array = Array(200000).fill(1);
      try {
        validateArrayLength(array, 'data');
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as Error).message).toContain('200000');
        expect((error as Error).message).toContain('100000');
      }
    });
  });

  describe('validateExpression', () => {
    it('should accept simple expressions', () => {
      const result = validateExpression('2 + 2', 'expr');
      expect(result).toBe('2 + 2');
    });

    it('should accept expressions with variables', () => {
      const result = validateExpression('x + y', 'expr');
      expect(result).toBe('x + y');
    });

    it('should accept expressions with functions', () => {
      const result = validateExpression('sin(x) + cos(y)', 'expr');
      expect(result).toBe('sin(x) + cos(y)');
    });

    it('should throw for non-string input', () => {
      expect(() => validateExpression(123 as any, 'expr')).toThrow(ValidationError);
      expect(() => validateExpression(123 as any, 'expr')).toThrow(/must be a string/);
    });

    it('should throw for empty expression', () => {
      expect(() => validateExpression('', 'expr')).toThrow(ValidationError);
      expect(() => validateExpression('', 'expr')).toThrow(/cannot be empty/);
    });

    it('should throw for whitespace-only expression', () => {
      expect(() => validateExpression('   ', 'expr')).toThrow(ValidationError);
      expect(() => validateExpression('   ', 'expr')).toThrow(/cannot be empty/);
    });

    it('should throw ComplexityError for expressions exceeding length limit', () => {
      const longExpr = 'x + '.repeat(5000) + 'y'; // > 10000 chars
      expect(() => validateExpression(longExpr, 'expr')).toThrow(ComplexityError);
      expect(() => validateExpression(longExpr, 'expr')).toThrow(/exceeds maximum allowed length/);
    });
  });

  describe('validateVariableName', () => {
    it('should accept valid variable names', () => {
      const result = validateVariableName('myVar', 'var');
      expect(result).toBe('myVar');
    });

    it('should accept variable names with underscores', () => {
      const result = validateVariableName('my_var', 'var');
      expect(result).toBe('my_var');
    });

    it('should accept variable names with numbers', () => {
      const result = validateVariableName('var123', 'var');
      expect(result).toBe('var123');
    });

    it('should throw for non-string input', () => {
      expect(() => validateVariableName(123 as any, 'var')).toThrow(ValidationError);
      expect(() => validateVariableName(123 as any, 'var')).toThrow(/must be a string/);
    });

    it('should throw for empty variable name', () => {
      expect(() => validateVariableName('', 'var')).toThrow(ValidationError);
      expect(() => validateVariableName('', 'var')).toThrow(/cannot be empty/);
    });

    it('should throw for variable names starting with numbers', () => {
      expect(() => validateVariableName('123var', 'var')).toThrow(ValidationError);
      expect(() => validateVariableName('123var', 'var')).toThrow(/must start with a letter/);
    });

    it('should throw for variable names exceeding length limit', () => {
      const longName = 'x'.repeat(101);
      expect(() => validateVariableName(longName, 'var')).toThrow(ValidationError);
      expect(() => validateVariableName(longName, 'var')).toThrow(/exceeds maximum allowed length/);
    });
  });
});
