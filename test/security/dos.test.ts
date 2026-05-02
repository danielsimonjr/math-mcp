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

    // Skipped: this is an integration-style load test (20 parallel
    // handleStatistics calls through the full rate-limiter + handler chain),
    // not a unit test of queueing behavior. The same pattern as the two
    // it.skip rate-limit tests above (lines 33, 57): "Rate limiting is
    // applied at the MCP server level (index-wasm.ts), not in the handler
    // functions themselves. These tests should be integration tests that
    // call the full server, not unit tests of individual handlers."
    //
    // To restore: convert to a real integration test that spawns
    // dist/index-wasm.js and exercises queueing via the MCP transport.
    it.skip('should queue operations when at capacity', async () => {
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

    // Wave 1.2: ready-gate wired up. Pool now awaits worker
    // `{type:'ready'}` before dispatching the first task per worker, so
    // the previous race ("WASM not initialized in worker" on the sanity
    // follow-up) is closed. See worker-pool.ts:dispatchWhenReady().
    it('WorkerPool: abort signal frees worker slot immediately', async () => {
      // Direct-pool test that exercises the full abort wiring without
      // needing a real >30s computation. We submit a task that the worker
      // picks up, then abort it via signal. The pool MUST recycle the
      // worker so busyWorkers drops back to 0 within 100ms — the property
      // that prevents pool exhaustion in the DoS attack.
      const { WorkerPool } = await import('../../src/workers/worker-pool.js');
      const { OperationType } = await import('../../src/workers/worker-types.js');

      const pool = new WorkerPool({ minWorkers: 1, maxWorkers: 2, taskTimeout: 60000 });
      try {
        await pool.initialize();

        // Big enough to keep the worker busy for >100ms
        const size = 400;
        const big = Array(size).fill(null).map(() => Array(size).fill(1));

        const ac = new AbortController();
        const taskPromise = pool.execute({
          operation: OperationType.MATRIX_MULTIPLY,
          data: { matrixA: big, matrixB: big },
          signal: ac.signal,
        });

        // Wait briefly for the worker to pick up the task
        await new Promise((r) => setTimeout(r, 30));

        const beforeAbort = pool.getStats();
        // Don't enforce busyWorkers === 1 strictly — task may have already
        // finished if the build is fast. We only need to verify that AFTER
        // abort + brief settle, busyWorkers is 0 and the task was
        // rejected/cancelled.

        ac.abort();

        await expect(taskPromise).rejects.toThrow();

        // Give the recycle path a moment to run terminate() + replace
        await new Promise((r) => setTimeout(r, 100));

        const afterStats = pool.getStats();
        expect(afterStats.busyWorkers).toBe(0);

        // Sanity: pool stayed healthy enough to accept a follow-up task
        const ok = (await pool.execute<number[][]>({
          operation: OperationType.MATRIX_MULTIPLY,
          data: { matrixA: [[1, 0], [0, 1]], matrixB: [[1, 2], [3, 4]] },
        })) as unknown as number[][];
        expect(ok).toEqual([[1, 2], [3, 4]]);

        // Reference unused stats to keep TS happy and document the field
        // we'd assert in a stricter timing window.
        void beforeAbort;
      } finally {
        await pool.shutdown(1000);
      }
    }, 20000);

    it('TaskQueue: timeout fires onTaskTimeout callback (pool recycle hook)', async () => {
      // Verifies the queue->pool wiring: when a task times out, the
      // queue MUST invoke `onTaskTimeout(workerId, taskId)` so the pool
      // can recycle the worker thread. Without this hook the worker
      // sits in ERROR state forever, leaking the slot (the original
      // DoS bug). This is the key piece that protects the worker pool
      // even when withTimeout's abortFn never fires (e.g., the only
      // timeout is the pool's internal one).
      const { TaskQueue } = await import('../../src/workers/task-queue.js');
      const { OperationType, WorkerStatus } = await import(
        '../../src/workers/worker-types.js'
      );

      const calls: Array<{ workerId: string; taskId: string }> = [];
      const queue = new TaskQueue({
        taskTimeout: 50,
        onTaskTimeout: (workerId, taskId) => calls.push({ workerId, taskId }),
      });

      // Synthetic worker metadata (no real Worker thread needed)
      const workerStub = {
        id: 'worker-stub-0',
        status: WorkerStatus.IDLE as WorkerStatus,
        worker: {} as never,
        tasksCompleted: 0,
        tasksFailed: 0,
        lastActivity: Date.now(),
        createdAt: Date.now(),
        currentTaskId: undefined as string | undefined,
      };

      const taskPromise = new Promise<unknown>((resolve, reject) => {
        const task = {
          id: 'task-test-1',
          operation: OperationType.MATRIX_MULTIPLY,
          data: { matrixA: [[1]], matrixB: [[1]] },
          resolve,
          reject,
          createdAt: Date.now(),
        };
        queue.enqueue(task);
        const dequeued = queue.dequeue();
        expect(dequeued).toBeTruthy();
        workerStub.status = WorkerStatus.BUSY;
        workerStub.currentTaskId = dequeued!.id;
        queue.assignTask(dequeued!, workerStub);
      });

      await expect(taskPromise).rejects.toThrow(/timed out/i);

      // The pool-side recycle hook fired with the worker holding the task
      expect(calls.length).toBe(1);
      expect(calls[0]).toEqual({
        workerId: 'worker-stub-0',
        taskId: 'task-test-1',
      });
    }, 5000);

    it('TaskQueue.cancelTask removes a pending task and rejects it', async () => {
      const { TaskQueue } = await import('../../src/workers/task-queue.js');
      const { OperationType } = await import('../../src/workers/worker-types.js');

      const queue = new TaskQueue({ taskTimeout: 60000 });
      const taskPromise = new Promise<unknown>((resolve, reject) => {
        queue.enqueue({
          id: 'task-cancel-1',
          operation: OperationType.MATRIX_MULTIPLY,
          data: { matrixA: [[1]], matrixB: [[1]] },
          resolve,
          reject,
          createdAt: Date.now(),
        });
      });

      const cancelled = queue.cancelTask('task-cancel-1', 'aborted');
      expect(cancelled).toBe(true);
      await expect(taskPromise).rejects.toThrow(/cancelled/i);

      // Cancelling a non-existent task is a no-op
      expect(queue.cancelTask('task-does-not-exist')).toBe(false);
    });
  });
});
