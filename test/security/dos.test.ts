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

import { describe, it, expect, afterEach } from 'vitest';
import {
  handleEvaluate,
  handleMatrixOperations,
  handleStatistics,
} from '../../src/tool-handlers.js';
import { globalRateLimiter, withRateLimit } from '../../src/rate-limiter.js';
import { RateLimitError } from '../../src/errors.js';

describe('DoS Protection', () => {
  // Reset rate limiter between tests
  afterEach(() => {
    globalRateLimiter.reset();
  });

  describe('Rate limiting', () => {
    // These exercise `withRateLimit(globalRateLimiter, fn)` -- the exact call
    // src/index.ts:266 wraps every tool invocation in. The previous versions
    // called handleEvaluate() directly and were skipped as unfixable, but the
    // reason was a layer mismatch, not an untestable control: the handlers were
    // never rate-limited, so flooding them could not produce a rejection no
    // matter how many requests were sent.
    it('should limit request rate', async () => {
      globalRateLimiter.reset();
      const { maxTokens } = globalRateLimiter.getStats();

      // Serial, so the concurrency limit cannot be what rejects: each call
      // completes before the next starts. Only the token bucket can fire.
      const outcomes: string[] = [];
      for (let i = 0; i < maxTokens + 20; i++) {
        try {
          await withRateLimit(globalRateLimiter, async () => 'ok');
          outcomes.push('accepted');
        } catch {
          outcomes.push('rejected');
        }
      }

      const accepted = outcomes.filter((o) => o === 'accepted').length;
      const rejected = outcomes.filter((o) => o === 'rejected').length;

      // Ground truth, not self-consistency: a token bucket of size maxTokens
      // refilling at maxTokens/windowMs admits ~maxTokens in a burst this short.
      expect(accepted).toBeGreaterThan(0);
      expect(rejected).toBeGreaterThan(0);
      expect(accepted).toBeLessThanOrEqual(maxTokens + 1);
      expect(accepted + rejected).toBe(maxTokens + 20);
    });

    it('should provide retry-after information on rate limit', async () => {
      globalRateLimiter.reset();
      const { maxTokens } = globalRateLimiter.getStats();

      let caught: unknown;
      for (let i = 0; i < maxTokens + 20 && caught === undefined; i++) {
        try {
          await withRateLimit(globalRateLimiter, async () => 'ok');
        } catch (e) {
          caught = e;
        }
      }

      expect(caught).toBeInstanceOf(RateLimitError);
      const err = caught as RateLimitError;
      expect(err.message).toMatch(/rate limit|too many|concurrent/i);

      // The rejection must carry the stats a caller needs to back off with,
      // not just a bare message -- that payload is the "retry-after" signal.
      const stats = err.stats as Record<string, number> | undefined;
      expect(stats).toBeDefined();
      expect(stats).toMatchObject({
        maxTokens,
        maxConcurrent: expect.any(Number),
      });
      expect(stats!.availableTokens).toBeLessThan(1);
    });

    it('should reject beyond the concurrency limit while requests are in flight', async () => {
      globalRateLimiter.reset();
      const { maxConcurrent } = globalRateLimiter.getStats();

      // Hold exactly maxConcurrent requests open, then attempt one more.
      let release!: () => void;
      const gate = new Promise<void>((r) => { release = r; });
      const inFlight = Array.from({ length: maxConcurrent }, () =>
        withRateLimit(globalRateLimiter, async () => { await gate; return 'ok'; })
      );
      // Let each one register as started before probing.
      await new Promise((r) => setTimeout(r, 0));

      expect(globalRateLimiter.getStats().concurrent).toBe(maxConcurrent);
      await expect(
        withRateLimit(globalRateLimiter, async () => 'ok')
      ).rejects.toBeInstanceOf(RateLimitError);

      release();
      await Promise.all(inFlight);
      // endRequest() must run in the finally block, or the limiter leaks slots
      // and the server wedges permanently after maxConcurrent requests.
      expect(globalRateLimiter.getStats().concurrent).toBe(0);
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
    it('completes a large in-limit matrix op (DoS guarded by size limits)', async () => {
      // DoS protection for matrix ops is now the SIZE LIMIT (truly huge inputs
      // are rejected — see "Size limits" / "Matrix operation DoS"), not an
      // interrupt: MathTS computes synchronously, and synchronous JS work can't
      // be aborted mid-run. An 800x800 is within the limit, so it is NOT
      // rejected; it completes correctly but slowly on the JS path (no Rust
      // WASM yet), hence the generous budget below.
      const largeSize = 800;
      const largeMatrix = Array(largeSize)
        .fill(null)
        .map(() => Array(largeSize).fill(1));

      const start = Date.now();
      const result = await handleMatrixOperations({
        operation: 'multiply',
        matrix_a: JSON.stringify(largeMatrix),
        matrix_b: JSON.stringify(largeMatrix),
      });
      const elapsed = Date.now() - start;

      expect(result.isError).toBe(false);
      expect(elapsed).toBeLessThan(90000); // JS matmul without WASM accel
    }, 100000);

    it('should timeout complex expressions', async () => {
      // Create extremely nested expression
      let expr = '1';
      for (let i = 0; i < 100; i++) {
        expr = `sin(cos(${expr}))`;
      }

      const start = Date.now();

      try {
        await handleEvaluate({ expression: expr });
      } catch {
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
        .map(() =>
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

    // Skipped: this is an integration-style load test (20 parallel
    // handleStatistics calls through the full rate-limiter + handler chain),
    // This replaces a skipped 'should queue operations when at capacity' test.
    // It was not merely testing the wrong layer -- it asserted a feature that
    // DOES NOT EXIST. RateLimiter ships allowQueue()/queueRequest()/
    // dequeueRequest() and a maxQueueSize of 50, and the module header lists
    // "Request queue size limits (max pending requests)" as a DoS protection
    // layer, but grep across src/ shows none of those three methods is ever
    // called. Nothing queues; getStats().queued is structurally always 0.
    //
    // So this pins the REAL behaviour at capacity -- reject, do not queue --
    // and guards the dead-code claim so it cannot quietly become true or drift
    // further. If queueing is ever implemented, this test should fail loudly.
    it('rejects rather than queues at capacity (queueing is NOT implemented)', async () => {
      globalRateLimiter.reset();
      const { maxConcurrent } = globalRateLimiter.getStats();

      let release!: () => void;
      const gate = new Promise<void>((r) => { release = r; });
      const inFlight = Array.from({ length: maxConcurrent }, () =>
        withRateLimit(globalRateLimiter, async () => { await gate; return 'ok'; })
      );
      await new Promise((r) => setTimeout(r, 0));

      // Over capacity: rejected immediately, and NOT parked in a queue.
      await expect(
        withRateLimit(globalRateLimiter, async () => 'ok')
      ).rejects.toBeInstanceOf(RateLimitError);
      expect(globalRateLimiter.getStats().queued).toBe(0);

      release();
      await Promise.all(inFlight);
      expect(globalRateLimiter.getStats().queued).toBe(0);
    });
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

  // --------------------------------------------------------------------
  // Abort propagation on timeout (worker-slot leak protection).
  //
  // Regression test for the DoS vulnerability where `withTimeout` only
  // freed the wrapper Promise; the underlying worker thread kept
  // computing and the worker slot leaked. Combined with maxConcurrent=10
  // and worker-pool maxQueueSize=1000, an attacker could exhaust the
  // pool by repeatedly hitting the 30s timeout. The fix wires
  // `abortFn` through `withTimeout` -> AbortSignal -> WorkerPool, so
  // a timed-out task forcibly terminates its worker.
  // --------------------------------------------------------------------
  describe('Abort path on timeout (worker-slot leak protection)', () => {
    it('withTimeout invokes abortFn on timeout and rejects with TimeoutError', async () => {
      const { withTimeout } = await import('../../src/utils.js');
      const { TimeoutError } = await import('../../src/errors.js');

      let aborted = false;
      const slow = new Promise<number>((resolve) => setTimeout(() => resolve(42), 5000));

      const start = Date.now();
      await expect(
        withTimeout(slow, 50, 'test_op', () => {
          aborted = true;
        })
      ).rejects.toThrow(TimeoutError);
      const elapsed = Date.now() - start;

      // Abort fired before/synchronous-with the rejection
      expect(aborted).toBe(true);
      // Wrapper rejected near the timeout, not after the slow promise
      expect(elapsed).toBeLessThan(500);
    });

    it('withTimeout does not invoke abortFn on natural rejection', async () => {
      const { withTimeout } = await import('../../src/utils.js');

      let aborted = false;
      const failing = Promise.reject(new Error('boom'));

      await expect(
        withTimeout(failing, 1000, 'test_op', () => {
          aborted = true;
        })
      ).rejects.toThrow('boom');

      expect(aborted).toBe(false);
    });

  });
});
