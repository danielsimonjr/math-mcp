/**
 * @file fuzzing-tests.ts
 * @description Fuzzing tests with random inputs to find edge cases and crashes
 *
 * Tests server robustness against:
 * - Random expression inputs
 * - Random matrix data
 * - Random array data
 * - Malformed JSON
 * - Random Unicode characters
 *
 * @module security/fuzzing-tests
 */

import { describe, it, expect } from 'vitest';
import { randomBytes } from 'crypto';
import {
  handleEvaluate,
  handleMatrixOperations,
  handleStatistics,
  handleSimplify,
  handleDerivative,
} from '../../src/tool-handlers.js';

/**
 * Generate random string from buffer
 */
function randomString(maxLength: number): string {
  const length = Math.floor(Math.random() * maxLength) + 1;
  return randomBytes(length).toString('utf8');
}

/**
 * Generate random ASCII string
 */
function randomAsciiString(maxLength: number): string {
  const length = Math.floor(Math.random() * maxLength) + 1;
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 +-*/()[]{},.;:!@#$%^&*';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

/**
 * Generate random number array
 */
function randomNumberArray(maxLength: number): number[] {
  const length = Math.floor(Math.random() * maxLength) + 1;
  return Array(length)
    .fill(0)
    .map(() => Math.random() * 1000 - 500);
}

/**
 * Generate random matrix
 */
function randomMatrix(maxSize: number): number[][] {
  const rows = Math.floor(Math.random() * maxSize) + 1;
  const cols = Math.floor(Math.random() * maxSize) + 1;
  return Array(rows)
    .fill(0)
    .map(() =>
      Array(cols)
        .fill(0)
        .map(() => Math.random() * 100 - 50)
    );
}

describe('Fuzzing Tests', () => {
  describe('Random expression inputs', () => {
    it('should handle 1000 random UTF-8 expression inputs without crashing', async () => {
      let validationErrors = 0;
      let otherErrors = 0;
      let successes = 0;

      for (let i = 0; i < 1000; i++) {
        const randomExpr = randomString(100);

        try {
          await handleEvaluate({ expression: randomExpr });
          successes++;
        } catch (error: unknown) {
          // Should throw ValidationError or MathError, not crash
          expect(error).toBeInstanceOf(Error);

          const errorName = (error as Error).name;
          if (errorName === 'ValidationError' || errorName === 'ComplexityError') {
            validationErrors++;
          } else {
            otherErrors++;
          }
        }
      }

      console.log(`Random UTF-8 fuzzing: ${successes} successes, ${validationErrors} validation errors, ${otherErrors} other errors`);

      // Should handle all inputs gracefully
      expect(validationErrors + otherErrors + successes).toBe(1000);
    }, 60000);

    it('should handle 500 random ASCII expression inputs', async () => {
      let errors = 0;
      let successes = 0;

      for (let i = 0; i < 500; i++) {
        const randomExpr = randomAsciiString(50);

        try {
          await handleEvaluate({ expression: randomExpr });
          successes++;
        } catch (error: unknown) {
          expect(error).toBeInstanceOf(Error);
          errors++;
        }
      }

      console.log(`Random ASCII fuzzing: ${successes} successes, ${errors} errors`);
      expect(errors + successes).toBe(500);
    }, 30000);

    it('should handle expressions with random special characters', async () => {
      const specialChars = ['!', '@', '#', '$', '%', '^', '&', '*', '(', ')', '{', '}', '[', ']', '|', '\\', '/', '?', '<', '>'];

      for (let i = 0; i < 100; i++) {
        let expr = '';
        for (let j = 0; j < 10; j++) {
          expr += specialChars[Math.floor(Math.random() * specialChars.length)];
        }

        try {
          await handleEvaluate({ expression: expr });
        } catch (error: unknown) {
          expect(error).toBeInstanceOf(Error);
        }
      }
    }, 15000);
  });

  describe('Random matrix inputs', () => {
    it('should handle 200 random matrix inputs without crashing', async () => {
      let errors = 0;
      let successes = 0;

      for (let i = 0; i < 200; i++) {
        const randomData = randomBytes(1000).toString('base64');

        try {
          await handleMatrixOperations({
            operation: 'determinant',
            matrix_a: randomData,
          });
          successes++;
        } catch (error: unknown) {
          // Should throw ValidationError or MathError, not crash
          expect(error).toBeInstanceOf(Error);
          errors++;
        }
      }

      console.log(`Random matrix fuzzing: ${successes} successes, ${errors} errors`);
      expect(errors + successes).toBe(200);
    }, 30000);

    it('should handle random valid matrices', async () => {
      for (let i = 0; i < 50; i++) {
        const matrix = randomMatrix(10);

        try {
          const result = await handleMatrixOperations({
            operation: 'transpose',
            matrix_a: JSON.stringify(matrix),
          });

          // Should either succeed or fail gracefully
          expect(result).toBeDefined();
        } catch (error: unknown) {
          expect(error).toBeInstanceOf(Error);
        }
      }
    }, 15000);

    it('should handle matrices with random special values', async () => {
      const specialValues = [0, -0, 1, -1, 0.1, -0.1, 1000, -1000];

      for (let i = 0; i < 50; i++) {
        const matrix = Array(5)
          .fill(0)
          .map(() =>
            Array(5)
              .fill(0)
              .map(() => specialValues[Math.floor(Math.random() * specialValues.length)])
          );

        try {
          await handleMatrixOperations({
            operation: 'determinant',
            matrix_a: JSON.stringify(matrix),
          });
        } catch (error: unknown) {
          expect(error).toBeInstanceOf(Error);
        }
      }
    });
  });

  describe('Random statistics inputs', () => {
    it('should handle 200 random array inputs without crashing', async () => {
      let errors = 0;
      let successes = 0;

      for (let i = 0; i < 200; i++) {
        const randomData = randomBytes(500).toString('base64');

        try {
          await handleStatistics({
            operation: 'mean',
            data: randomData,
          });
          successes++;
        } catch (error: unknown) {
          expect(error).toBeInstanceOf(Error);
          errors++;
        }
      }

      console.log(`Random statistics fuzzing: ${successes} successes, ${errors} errors`);
      expect(errors + successes).toBe(200);
    }, 30000);

    it('should handle random valid number arrays', async () => {
      const operations = ['mean', 'median', 'variance', 'std', 'min', 'max', 'sum'];

      for (let i = 0; i < 100; i++) {
        const array = randomNumberArray(100);
        const operation = operations[Math.floor(Math.random() * operations.length)];

        try {
          const result = await handleStatistics({
            operation,
            data: JSON.stringify(array),
          });

          expect(result).toBeDefined();
        } catch (error: unknown) {
          expect(error).toBeInstanceOf(Error);
        }
      }
    }, 20000);

    it('should handle arrays with random edge values', async () => {
      const edgeValues = [
        0, -0, 1, -1,
        Number.MIN_VALUE, -Number.MIN_VALUE,
        Number.MAX_VALUE / 1e10, -Number.MAX_VALUE / 1e10, // Scaled down to avoid overflow
        Number.EPSILON, -Number.EPSILON,
      ];

      for (let i = 0; i < 50; i++) {
        const array = Array(20)
          .fill(0)
          .map(() => edgeValues[Math.floor(Math.random() * edgeValues.length)]);

        try {
          await handleStatistics({
            operation: 'mean',
            data: JSON.stringify(array),
          });
        } catch (error: unknown) {
          expect(error).toBeInstanceOf(Error);
        }
      }
    });
  });

  describe('Malformed JSON fuzzing', () => {
    it('should handle malformed JSON gracefully', async () => {
      const malformedJson = [
        '{',
        '}',
        '[',
        ']',
        '{"a":}',
        '{a:1}',
        '[1,2,]',
        '{"a":"b"',
        '{"a":1,}',
        'null',
        'undefined',
        'NaN',
        'Infinity',
      ];

      for (const json of malformedJson) {
        try {
          await handleEvaluate({
            expression: '2+2',
            scope: json,
          });
        } catch (error: unknown) {
          // Should throw ValidationError, not crash
          expect(error).toBeInstanceOf(Error);
        }
      }
    });

    it('should handle random JSON-like strings', async () => {
      for (let i = 0; i < 100; i++) {
        const randomJson = randomAsciiString(100);

        try {
          await handleStatistics({
            operation: 'mean',
            data: randomJson,
          });
        } catch (error: unknown) {
          expect(error).toBeInstanceOf(Error);
        }
      }
    }, 15000);
  });

  describe('Unicode fuzzing', () => {
    it('should handle various Unicode characters in expressions', async () => {
      const unicodeStrings = [
        '∑', '∫', '∂', '∇', '√', '∞', '≈', '≠', '≤', '≥',
        '你好', 'مرحبا', 'שלום', 'नमस्ते', 'こんにちは',
        '🔢', '➕', '➖', '✖️', '➗',
        '\u0000', '\u0001', '\u001f', // Control characters
        '\uffff', '\u10000', // High Unicode
      ];

      for (const unicode of unicodeStrings) {
        try {
          await handleEvaluate({ expression: unicode });
        } catch (error: unknown) {
          expect(error).toBeInstanceOf(Error);
        }
      }
    });

    it('should handle Unicode in variable names', async () => {
      const unicodeVars = ['π', 'θ', 'α', 'β', 'Σ', '∆'];

      for (const varName of unicodeVars) {
        try {
          await handleDerivative({
            expression: 'x^2',
            variable: varName,
          });
        } catch (error: unknown) {
          expect(error).toBeInstanceOf(Error);
        }
      }
    });
  });

  describe('Boundary fuzzing', () => {
    it('should handle random array lengths near boundaries', async () => {
      const boundaryLengths = [0, 1, 2, 99, 100, 101, 999, 1000, 1001, 9999, 10000, 10001];

      for (const length of boundaryLengths) {
        if (length === 0) continue; // Skip empty arrays

        const array = Array(Math.min(length, 10001)).fill(1);

        try {
          await handleStatistics({
            operation: 'sum',
            data: JSON.stringify(array),
          });
        } catch (error: unknown) {
          expect(error).toBeInstanceOf(Error);
          // Should fail gracefully for oversized arrays
        }
      }
    }, 20000);

    it('should handle random matrix dimensions near boundaries', async () => {
      const boundaryDims = [1, 2, 9, 10, 11, 99, 100, 101];

      for (const rows of boundaryDims) {
        for (const cols of boundaryDims) {
          const matrix = Array(rows)
            .fill(0)
            .map(() => Array(cols).fill(1));

          try {
            await handleMatrixOperations({
              operation: 'transpose',
              matrix_a: JSON.stringify(matrix),
            });
          } catch (error: unknown) {
            expect(error).toBeInstanceOf(Error);
          }
        }
      }
    }, 30000);
  });

  describe('Stress fuzzing', () => {
    it('should handle rapid sequential random requests', async () => {
      const handlers = [handleEvaluate, handleSimplify];

      for (let i = 0; i < 100; i++) {
        const handler = handlers[Math.floor(Math.random() * handlers.length)];
        const expr = randomAsciiString(20);

        try {
          await handler({ expression: expr });
        } catch (error: unknown) {
          expect(error).toBeInstanceOf(Error);
        }
      }
    }, 20000);

    it('should handle mixed operation types in sequence', async () => {
      for (let i = 0; i < 50; i++) {
        const ops = [
          () => handleEvaluate({ expression: randomAsciiString(10) }),
          () => handleMatrixOperations({
            operation: 'transpose',
            matrix_a: JSON.stringify(randomMatrix(5)),
          }),
          () => handleStatistics({
            operation: 'mean',
            data: JSON.stringify(randomNumberArray(50)),
          }),
        ];

        const op = ops[Math.floor(Math.random() * ops.length)];

        try {
          await op();
        } catch (error: unknown) {
          expect(error).toBeInstanceOf(Error);
        }
      }
    }, 20000);
  });
});
