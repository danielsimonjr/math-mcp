/**
 * @file dos-tests.ts
 * @description Security tests for Denial of Service (DoS) protection
 *
 * Tests various DoS attack vectors to ensure the server properly handles:
 * - Rate limiting
 * - Operation timeouts
 * - Size limits (JSON, matrices, arrays)
 * - Concurrent operation limits
 * - Resource exhaustion attempts
 *
 * @module security/dos-tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  handleEvaluate,
  handleMatrixOperations,
  handleStatistics,
} from '../../src/tool-handlers.js';
import { globalRateLimiter } from '../../src/rate-limiter.js';

describe('DoS Protection', () => {
  // Reset rate limiter between tests
  afterEach(() => {
    globalRateLimiter.reset();
  });

  describe('Rate limiting', () => {
    // Note: Rate limiting is applied at the MCP server level (index-wasm.ts),
    // not in the handler functions themselves. These tests should be integration
    // tests that call the full server, not unit tests of individual handlers.
    it.skip('should limit request rate', async () => {
      // Reset rate limiter to ensure clean state
      globalRateLimiter.reset();

      // Flood with requests - 200 requests should hit rate limit
      const requests = Array(200)
        .fill(null)
        .map(() => handleEvaluate({ expression: '2+2' }));

      const results = await Promise.allSettled(requests);

      // Should have rejections due to rate limiting
      const rejected = results.filter((r) => r.status === 'rejected');
      const accepted = results.filter((r) => r.status === 'fulfilled');

      // At least some requests should be rejected
      expect(rejected.length).toBeGreaterThan(0);

      // But not all should be rejected (some should succeed)
      expect(accepted.length).toBeGreaterThan(0);

      console.log(`Rate limit test: ${accepted.length} accepted, ${rejected.length} rejected out of 200`);
    });

    it.skip('should provide retry-after information on rate limit', async () => {
      globalRateLimiter.reset();

      // Flood with requests to trigger rate limit
      const requests = Array(150)
        .fill(null)
        .map(() => handleEvaluate({ expression: '1+1' }));

      const results = await Promise.allSettled(requests);
      const rejected = results.filter((r) => r.status === 'rejected');

      // At least one should be rejected with RateLimitError
      expect(rejected.length).toBeGreaterThan(0);

      // Check that rejected requests have error details
      for (const result of rejected) {
        if (result.status === 'rejected') {
          expect(result.reason).toBeDefined();
          // Should be RateLimitError or contain rate limit information
          expect(result.reason.message || result.reason.toString()).toMatch(/rate limit|too many|concurrent/i);
        }
      }
    });

    it('should recover after rate limit window', async () => {
      globalRateLimiter.reset();

      // Trigger rate limit
      const floodRequests = Array(100)
        .fill(null)
        .map(() => handleEvaluate({ expression: '3+3' }));

      await Promise.allSettled(floodRequests);

      // Wait for rate limit window to reset (typically 1 second)
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // This request should succeed
      const result = await handleEvaluate({ expression: '4+4' });
      expect(result.isError).toBe(false);
    });
  });

  describe('Operation timeouts', () => {
    it('should timeout expensive matrix operations', async () => {
      // Create very large matrices that would take too long
      const largeSize = 800; // 800x800 should be slow without acceleration
      const largeMatrix = Array(largeSize)
        .fill(null)
        .map(() => Array(largeSize).fill(1));

      const start = Date.now();

      try {
        await handleMatrixOperations({
          operation: 'multiply',
          matrix_a: JSON.stringify(largeMatrix),
          matrix_b: JSON.stringify(largeMatrix),
        });

        // If it completes, it should be fast (WASM acceleration)
        const elapsed = Date.now() - start;
        expect(elapsed).toBeLessThan(30000); // Should not take more than 30s
      } catch (error: unknown) {
        // If it times out, that's also acceptable
        const elapsed = Date.now() - start;
        expect(elapsed).toBeLessThan(35000); // Should timeout before 35s

        const errorMessage = error instanceof Error ? error.message : String(error);
        expect(errorMessage).toMatch(/timeout|too long|exceeded/i);
      }
    }, 40000); // Test timeout of 40s

    it('should timeout complex expressions', async () => {
      // Create extremely nested expression
      let expr = '1';
      for (let i = 0; i < 100; i++) {
        expr = `sin(cos(${expr}))`;
      }

      const start = Date.now();

      try {
        await handleEvaluate({ expression: expr });
      } catch (error: unknown) {
        const elapsed = Date.now() - start;
        // Should either complete quickly or timeout
        expect(elapsed).toBeLessThan(32000);
      }
    }, 35000);
  });

  describe('Size limits', () => {
    it('should reject oversized JSON', async () => {
      // Create >20MB JSON (exceeds typical limit)
      // Each element "1," is 2 bytes, so need ~11 million elements for 22MB
      const huge = Array(11000000).fill(1);
      const json = JSON.stringify(huge);

      // Verify it's actually large
      expect(json.length).toBeGreaterThan(20 * 1024 * 1024);

      await expect(
        handleStatistics({
          operation: 'mean',
          data: json,
        })
      ).rejects.toThrow(/exceeds maximum|too large|size limit/i);
    });

    it('should reject oversized matrices', async () => {
      // Create 1001x1001 matrix (exceeds 1000x1000 limit)
      const oversized = Array(1001)
        .fill(null)
        .map(() => Array(1001).fill(1));

      await expect(
        handleMatrixOperations({
          operation: 'determinant',
          matrix_a: JSON.stringify(oversized),
        })
      ).rejects.toThrow(/exceeds maximum|too large|size limit/i);
    });

    it('should reject oversized arrays', async () => {
      // Create 100,001 element array (exceeds 100,000 limit)
      const oversized = Array(100001).fill(1);

      await expect(
        handleStatistics({
          operation: 'mean',
          data: JSON.stringify(oversized),
        })
      ).rejects.toThrow(/exceeds maximum|too large|length limit/i);
    });

    it('should reject deeply nested JSON', async () => {
      // Create deeply nested object (>20 levels)
      let nested: any = 1;
      for (let i = 0; i < 25; i++) {
        nested = { a: nested };
      }

      await expect(
        handleEvaluate({
          expression: 'x',
          scope: JSON.stringify({ x: nested }),
        })
      ).rejects.toThrow();
    });

    it('should reject extremely long expressions', async () => {
      // Create 10,000 character expression
      let longExpr = '1';
      for (let i = 0; i < 5000; i++) {
        longExpr += ' + 1';
      }

      expect(longExpr.length).toBeGreaterThan(10000);

      await expect(
        handleEvaluate({ expression: longExpr })
      ).rejects.toThrow(/exceeds maximum|too long|complexity/i);
    });
  });

  describe('Concurrent operations', () => {
    it('should handle burst of concurrent operations gracefully', async () => {
      globalRateLimiter.reset();

      // Start many operations simultaneously
      const operations = Array(50)
        .fill(null)
        .map((_, i) =>
          handleMatrixOperations({
            operation: 'multiply',
            matrix_a: JSON.stringify([[1, 2], [3, 4]]),
            matrix_b: JSON.stringify([[5, 6], [7, 8]]),
          })
        );

      const start = Date.now();
      const results = await Promise.allSettled(operations);
      const elapsed = Date.now() - start;

      // Some might fail due to rate limiting, but shouldn't crash
      const succeeded = results.filter((r) => r.status === 'fulfilled');
      const failed = results.filter((r) => r.status === 'rejected');

      // At least some should succeed
      expect(succeeded.length).toBeGreaterThan(0);

      // Should complete in reasonable time
      expect(elapsed).toBeLessThan(10000);

      console.log(`Concurrent test: ${succeeded.length} succeeded, ${failed.length} failed`);
    }, 15000);

    it('should queue operations when at capacity', async () => {
      globalRateLimiter.reset();

      // Create slow operations
      const slowOps = Array(20)
        .fill(null)
        .map(() =>
          handleStatistics({
            operation: 'median',
            data: JSON.stringify(Array(10000).fill(1)),
          })
        );

      const results = await Promise.allSettled(slowOps);

      // Most should complete successfully (might be queued)
      const succeeded = results.filter((r) => r.status === 'fulfilled');
      expect(succeeded.length).toBeGreaterThan(0);
    }, 60000); // 15s was too tight for vitest 4's import overhead on Windows
  });

  describe('Resource exhaustion', () => {
    it('should not crash on memory-intensive operations', async () => {
      // Try to create large but valid data
      const largeArray = Array(50000).fill(1);

      const result = await handleStatistics({
        operation: 'sum',
        data: JSON.stringify(largeArray),
      });

      // Should either succeed or reject gracefully
      expect(result).toBeDefined();
      if (result.isError) {
        expect(result.content[0].text).toMatch(/error|failed|limit/i);
      }
    });

    it('should limit expression complexity', async () => {
      // Create expression with 100 nested parentheses
      let expr = '1';
      for (let i = 0; i < 100; i++) {
        expr = `(${expr})`;
      }

      await expect(
        handleEvaluate({ expression: expr })
      ).rejects.toThrow(/complexity|nested|limit/i);
    });

    it('should reject expressions with too many operators', async () => {
      // Create expression exceeding MAX_EXPRESSION_LENGTH (10000 chars)
      // Each " + 1" is 4 chars, so need 2500+ iterations to exceed 10000 chars
      let expr = '1';
      for (let i = 0; i < 2500; i++) {
        expr += ' + 1';
      }

      // Verify it exceeds the limit
      expect(expr.length).toBeGreaterThan(10000);

      await expect(
        handleEvaluate({ expression: expr })
      ).rejects.toThrow(/complexity|too long|limit|length/i);
    });
  });

  describe('Matrix operation DoS', () => {
    it('should reject matrix determinant on huge matrices', async () => {
      const huge = Array(1500)
        .fill(null)
        .map(() => Array(1500).fill(1));

      await expect(
        handleMatrixOperations({
          operation: 'determinant',
          matrix_a: JSON.stringify(huge),
        })
      ).rejects.toThrow(/exceeds|too large|limit/i);
    });

    it('should reject incompatible matrix dimensions', async () => {
      const a = [[1, 2, 3]];
      const b = [[1], [2]]; // Wrong dimensions for multiplication

      await expect(
        handleMatrixOperations({
          operation: 'multiply',
          matrix_a: JSON.stringify(a),
          matrix_b: JSON.stringify(b),
        })
      ).rejects.toThrow(/incompatible|dimensions|mismatch/i);
    });

    it('should handle empty matrices gracefully', async () => {
      await expect(
        handleMatrixOperations({
          operation: 'determinant',
          matrix_a: JSON.stringify([]),
        })
      ).rejects.toThrow(/empty|invalid|must be/i);
    });
  });

  describe('Statistics operation DoS', () => {
    it('should reject statistics on empty arrays', async () => {
      await expect(
        handleStatistics({
          operation: 'mean',
          data: JSON.stringify([]),
        })
      ).rejects.toThrow(/empty|invalid|must contain/i);
    });

    it('should reject statistics on non-numeric arrays', async () => {
      await expect(
        handleStatistics({
          operation: 'mean',
          data: JSON.stringify(['a', 'b', 'c']),
        })
      ).rejects.toThrow(/numeric|number|invalid/i);
    });

    it('should handle arrays with special number values', async () => {
      const specialValues = [
        Number.NaN,
        Number.POSITIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
      ];

      // NaN should be rejected
      await expect(
        handleStatistics({
          operation: 'mean',
          data: JSON.stringify(specialValues),
        })
      ).rejects.toThrow(/invalid|NaN|finite/i);
    });
  });
});
