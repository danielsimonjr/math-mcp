/**
 * @file worker-pool.test.ts
 * @description Unit tests for workers/worker-pool module
 *
 * Tests the WorkerPool class focused on initialization-race behavior:
 * the pool must not dispatch task messages to a freshly-spawned worker
 * before that worker signals `{type:'ready'}` (i.e. before WASM init
 * completes inside the worker thread). Without the gate, the very first
 * task on a new worker can hit "WASM not initialized in worker".
 *
 * Requires `dist/workers/math-worker.js` to exist; tests use real worker
 * threads, not stubs, since the race is in worker-thread bootstrap timing.
 *
 * @since 3.1.x
 */

import { describe, it, expect, afterEach } from 'vitest';
import { WorkerPool } from '../../../src/workers/worker-pool.js';
import { OperationType } from '../../../src/workers/worker-types.js';

describe('workers/worker-pool', () => {
  let pool: WorkerPool | undefined;

  afterEach(async () => {
    if (pool) {
      await pool.shutdown(2000);
      pool = undefined;
    }
  });

  describe('ready-gate (WASM init race)', () => {
    it('dispatches first task only after worker signals {type:"ready"}', async () => {
      // RED-able test: without the readyPromise gate, the pool posts the
      // task message to the freshly-spawned worker before its async
      // initWASM() call resolves. The worker then tries to execute the
      // matrix multiply against an uninitialized WASM module, surfacing
      // as "WASM not initialized in worker" (or a similar init error).
      pool = new WorkerPool({ minWorkers: 1, maxWorkers: 1, taskTimeout: 10000 });
      await pool.initialize();

      // Execute IMMEDIATELY after initialize() resolves. initialize() awaits
      // worker spawn but NOT WASM-ready inside the worker — so this is the
      // exact window the gate must close.
      const result = (await pool.execute<number[][]>({
        operation: OperationType.MATRIX_MULTIPLY,
        data: { matrixA: [[1, 0], [0, 1]], matrixB: [[1, 2], [3, 4]] },
      })) as unknown as number[][];

      expect(result).toEqual([[1, 2], [3, 4]]);
    }, 15000);

    it('subsequent tasks on same worker do not re-await ready', async () => {
      // After the first task completes, the worker is known-ready. The
      // second task must dispatch without any extra delay (the gate is
      // a one-shot per-worker promise, not re-armed each task).
      pool = new WorkerPool({ minWorkers: 1, maxWorkers: 1, taskTimeout: 10000 });
      await pool.initialize();

      const r1 = (await pool.execute<number[][]>({
        operation: OperationType.MATRIX_MULTIPLY,
        data: { matrixA: [[1, 0], [0, 1]], matrixB: [[2, 3], [4, 5]] },
      })) as unknown as number[][];
      expect(r1).toEqual([[2, 3], [4, 5]]);

      const t0 = Date.now();
      const r2 = (await pool.execute<number[][]>({
        operation: OperationType.MATRIX_MULTIPLY,
        data: { matrixA: [[1, 0], [0, 1]], matrixB: [[6, 7], [8, 9]] },
      })) as unknown as number[][];
      const elapsed = Date.now() - t0;
      expect(r2).toEqual([[6, 7], [8, 9]]);
      // Trivial 2x2 multiply on a warm worker should land well under 1s.
      // This is a soft check that no pre-task wait was reintroduced.
      expect(elapsed).toBeLessThan(2000);
    }, 20000);
  });
});
