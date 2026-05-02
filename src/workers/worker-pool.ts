/**
 * @file worker-pool.ts
 * @description Worker pool manager for parallel mathematical operations
 *
 * This module provides the main WorkerPool class that:
 * - Manages a pool of worker threads
 * - Distributes tasks across workers
 * - Handles worker lifecycle (creation, reuse, termination)
 * - Provides graceful degradation when workers unavailable
 *
 * @module workers/worker-pool
 * @since 3.0.0
 */

import { Worker } from 'worker_threads';
import { cpus } from 'os';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  WorkerPoolConfig,
  WorkerMetadata,
  WorkerStatus,
  WorkerPoolStats,
  OperationType,
  WorkerRequest,
  WorkerResponse,
  WorkerResult,
  Task,
  isSuccessResponse,
} from './worker-types.js';
import { TaskQueue } from './task-queue.js';
import { logger } from '../utils.js';
import { WasmError } from '../errors.js';

/**
 * Resolves the absolute path to the compiled `math-worker.js` script.
 *
 * Handles two execution contexts:
 *  1. Production runtime: this module loads from `dist/workers/worker-pool.js`,
 *     and the sibling `math-worker.js` exists in the same directory.
 *  2. Test runtime (vitest): this module loads from `src/workers/worker-pool.ts`,
 *     where only `math-worker.ts` exists. The compiled `math-worker.js` is in
 *     `dist/workers/`. We walk parent directories until a `package.json` is
 *     found, then resolve to `<projectRoot>/dist/workers/math-worker.js`.
 *
 * @param {string} moduleUrl - typically `import.meta.url` of the caller
 * @returns {string} absolute filesystem path to a `math-worker.js` that exists
 * @throws {Error} when neither sibling nor project-root resolution finds the file
 */
function resolveWorkerPath(moduleUrl: string): string {
  const here = dirname(fileURLToPath(moduleUrl));

  // Preferred: sibling math-worker.js (production runtime under dist/workers/).
  const sibling = join(here, 'math-worker.js');
  if (existsSync(sibling)) {
    return sibling;
  }

  // Fallback: walk up to project root (directory containing package.json),
  // then resolve to dist/workers/math-worker.js (test runtime under src/workers/).
  let current = here;
  // Cap the walk to avoid pathological infinite loops on broken filesystems.
  for (let i = 0; i < 16; i++) {
    if (existsSync(join(current, 'package.json'))) {
      const fromRoot = join(current, 'dist', 'workers', 'math-worker.js');
      if (existsSync(fromRoot)) {
        return fromRoot;
      }
      break;
    }
    const parent = dirname(current);
    if (parent === current) break; // reached filesystem root
    current = parent;
  }

  throw new Error(
    `Unable to locate math-worker.js. Searched sibling of ${here} and ` +
      `dist/workers/ relative to project root. Run \`npm run build\` to generate the worker bundle.`
  );
}

/**
 * Default worker pool configuration.
 *
 * Environment variables:
 * - MIN_WORKERS: Minimum workers to keep alive (default: 2, can be 0 for auto-scaling)
 * - MAX_WORKERS: Maximum concurrent workers (default: CPU cores - 1)
 * - WORKER_IDLE_TIMEOUT: Idle timeout in ms before worker termination (default: 60000)
 *
 * @constant
 */
const DEFAULT_CONFIG: Required<WorkerPoolConfig> = {
  maxWorkers: parseInt(process.env.MAX_WORKERS || String(Math.max(2, cpus().length - 1)), 10),
  minWorkers: parseInt(process.env.MIN_WORKERS || '2', 10),
  workerIdleTimeout: parseInt(process.env.WORKER_IDLE_TIMEOUT || '60000', 10),
  taskTimeout: 30000, // 30 seconds
  maxQueueSize: 1000,
  enablePerformanceTracking: false,
  enableDebugLogging: false,
};

/**
 * Worker pool for parallel mathematical computations.
 *
 * **Features:**
 * - Dynamic worker scaling (min to max workers)
 * - Task queue with priority support
 * - Automatic worker recycling on error
 * - Performance monitoring
 * - Graceful shutdown
 *
 * **Usage:**
 * ```typescript
 * const pool = new WorkerPool({ maxWorkers: 4 });
 * await pool.initialize();
 *
 * const result = await pool.execute({
 *   operation: OperationType.MATRIX_MULTIPLY,
 *   data: { matrixA, matrixB }
 * });
 *
 * await pool.shutdown();
 * ```
 *
 * @class WorkerPool
 * @since 3.0.0
 */
export class WorkerPool {
  /** Pool configuration */
  private readonly config: Required<WorkerPoolConfig>;

  /** Active workers */
  private workers: Map<string, WorkerMetadata> = new Map();

  /** Task queue */
  private taskQueue: TaskQueue;

  /** Next worker ID counter */
  private nextWorkerId = 0;

  /** Pool initialization status */
  private initialized = false;

  /** Pool shutdown status */
  private shuttingDown = false;

  /** Pool creation timestamp */
  private readonly createdAt: number;

  /** Worker idle check interval */
  private idleCheckInterval?: NodeJS.Timeout;

  /**
   * Maximum time (ms) to wait for a freshly-spawned worker to post its
   * `{type:'ready'}` message after async WASM init. If exceeded, the
   * worker is treated as wedged: its readyPromise rejects, the in-flight
   * dispatch fails fast, and the worker is recycled so capacity is
   * restored. 5s is generous compared to typical WASM init (~50–200ms)
   * but tight enough that wedged workers don't tie up tasks for long.
   */
  private static readonly READY_TIMEOUT_MS = 5000;

  /**
   * Creates a new worker pool.
   *
   * @param {Partial<WorkerPoolConfig>} [config] - Pool configuration
   */
  constructor(config?: Partial<WorkerPoolConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.createdAt = Date.now();

    this.taskQueue = new TaskQueue({
      maxQueueSize: this.config.maxQueueSize,
      taskTimeout: this.config.taskTimeout,
      // On task timeout, forcibly terminate the worker thread. The worker
      // is still running CPU-bound JS and cannot be stopped cooperatively;
      // without `terminate()` the slot leaks (DoS). After termination the
      // pool replenishes back up to `minWorkers` so capacity is restored
      // immediately.
      onTaskTimeout: (workerId) => {
        this.recycleWorker(workerId).catch((err) => {
          logger.error('Failed to recycle worker after task timeout', {
            workerId,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      },
    });

    logger.info('WorkerPool created', {
      maxWorkers: this.config.maxWorkers,
      minWorkers: this.config.minWorkers,
      taskTimeout: this.config.taskTimeout,
    });
  }

  /**
   * Initializes the worker pool.
   *
   * Creates the minimum number of workers and starts idle worker monitoring.
   *
   * @returns {Promise<void>}
   * @throws {WasmError} If worker threads are not supported
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.warn('WorkerPool already initialized');
      return;
    }

    // Check if worker_threads are supported
    try {
      // This will throw if worker_threads not available
      const testWorker = new Worker(
        `
        const { parentPort } = require('worker_threads');
        parentPort.postMessage('ready');
      `,
        { eval: true }
      );
      await testWorker.terminate();
    } catch {
      throw new WasmError(
        'Worker threads not supported in this environment. ' +
          'Parallel processing unavailable. ' +
          'Will fall back to WASM/mathjs single-threaded execution.'
      );
    }

    logger.info('Initializing worker pool...', {
      minWorkers: this.config.minWorkers,
    });

    // Create minimum workers
    for (let i = 0; i < this.config.minWorkers; i++) {
      await this.createWorker();
    }

    // Start idle worker monitoring
    this.startIdleMonitoring();

    this.initialized = true;

    logger.info('WorkerPool initialized successfully', {
      activeWorkers: this.workers.size,
    });
  }

  /**
   * Creates a new worker and adds it to the pool.
   *
   * @returns {Promise<WorkerMetadata>} The created worker metadata
   * @private
   */
  private async createWorker(): Promise<WorkerMetadata> {
    const workerId = `worker-${this.nextWorkerId++}`;

    logger.debug('Creating worker', { workerId });

    // Get path to worker script. Resolve dual-context:
    //  - Production: import.meta.url is dist/workers/worker-pool.js, sibling math-worker.js exists.
    //  - Test (vitest): import.meta.url is src/workers/worker-pool.ts where only math-worker.ts
    //    exists; the compiled math-worker.js lives in dist/workers/. Walk up until we find
    //    package.json, then fall back to <projectRoot>/dist/workers/math-worker.js.
    const workerPath = resolveWorkerPath(import.meta.url);

    // Create worker
    const worker = new Worker(workerPath);

    // Wire the ready-gate BEFORE installing the regular message handler.
    // The worker posts `{type:'ready'}` after `await initWASM()` resolves
    // (see math-worker.ts:main). We capture that exactly once here and
    // resolve readyPromise; any later messages flow to handleWorkerMessage
    // as task responses. A 5s timeout ensures a wedged worker (one that
    // never finishes WASM init) fails fast instead of indefinitely
    // blocking dispatch.
    let resolveReady!: () => void;
    let rejectReady!: (reason: Error) => void;
    const readyPromise = new Promise<void>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });

    const readyTimer = setTimeout(() => {
      rejectReady(
        new Error(
          `Worker ${workerId} did not signal ready within ${WorkerPool.READY_TIMEOUT_MS}ms`
        )
      );
    }, WorkerPool.READY_TIMEOUT_MS);

    // Single 'message' listener for this worker's lifetime. Filters
    // bootstrap protocol frames (`{type:'init'}` and `{type:'ready'}`)
    // and forwards genuine task-response messages to the task handler.
    //
    // Why filter `init` too: math-worker.ts emits `{type:'init',success:T/F}`
    // before `{type:'ready'}`. If `init` reaches handleWorkerMessage it
    // resets the worker's BUSY status back to IDLE and clears
    // currentTaskId — which makes dispatchWhenReady skip the postMessage
    // because the task no longer "belongs" to the worker. Result: task
    // hangs until taskTimeout fires. Filter both frames here.
    //
    // Genuine task responses always carry an `id` (matching the
    // WorkerRequest.id), never a `type`, so we use `'type' in msg` as
    // the protocol-frame discriminator.
    const onMessage = (msg: unknown): void => {
      if (msg && typeof msg === 'object' && 'type' in (msg as object)) {
        const type = (msg as { type?: unknown }).type;
        if (type === 'ready') {
          clearTimeout(readyTimer);
          resolveReady();
          return;
        }
        if (type === 'init' || type === 'fatal_error') {
          // `init` is informational; success/failure is reflected in the
          // ready promise (worker only emits ready when wasmInitialized
          // becomes true). `fatal_error` will be followed by worker exit
          // which the 'exit' handler picks up.
          return;
        }
        // Unknown protocol frame — log and drop rather than misroute it
        // through handleWorkerMessage (which would call failTask/
        // completeTask with an undefined id).
        logger.warn('Worker emitted unknown protocol frame', {
          workerId,
          type: String(type),
        });
        return;
      }
      this.handleWorkerMessage(workerId, msg as WorkerResponse);
    };
    worker.on('message', onMessage);

    // Create metadata
    const metadata: WorkerMetadata = {
      id: workerId,
      status: WorkerStatus.IDLE,
      worker,
      tasksCompleted: 0,
      tasksFailed: 0,
      lastActivity: Date.now(),
      createdAt: Date.now(),
      readyPromise,
      abandonReady: (reason: Error) => {
        clearTimeout(readyTimer);
        rejectReady(reason);
      },
    };

    // Surface readyPromise rejections so unhandled-rejection warnings
    // don't leak into test output. The dispatcher (scheduleNextTask) is
    // the official awaiter; this attach is purely defensive for the case
    // where a worker is recycled before it ever gets a task.
    readyPromise.catch(() => {
      // intentionally swallowed — recycle path logs the underlying reason
    });

    // Set up the rest of the event handlers (error/exit/task responses).
    this.setupWorkerEventHandlers(metadata);

    // Add to pool
    this.workers.set(workerId, metadata);

    logger.debug('Worker created', { workerId, totalWorkers: this.workers.size });

    return metadata;
  }

  /**
   * Sets up event handlers for a worker.
   *
   * @param {WorkerMetadata} metadata - Worker metadata
   * @private
   */
  private setupWorkerEventHandlers(metadata: WorkerMetadata): void {
    const { worker, id: workerId } = metadata;

    // NOTE: the 'message' handler is intentionally installed in
    // createWorker() (the ready-gate path) — that handler consumes the
    // one-shot `{type:'ready'}` frame and forwards every subsequent
    // message to handleWorkerMessage. Adding another listener here
    // would double-process task responses.

    // Handle worker errors
    worker.on('error', (error: Error) => {
      logger.error('Worker error', {
        workerId,
        error: error.message,
        stack: error.stack,
      });

      metadata.status = WorkerStatus.ERROR;
      metadata.tasksFailed++;

      // Fail the current task if any
      if (metadata.currentTaskId) {
        this.taskQueue.failTask(metadata.currentTaskId, error);
        metadata.currentTaskId = undefined;
      }

      // Recycle the worker (handle promise rejection)
      this.recycleWorker(workerId).catch((err) => {
        logger.error('Failed to recycle worker', {
          workerId,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    });

    // Handle worker exit
    worker.on('exit', (code: number) => {
      if (code !== 0 && !this.shuttingDown) {
        logger.warn('Worker exited unexpectedly', {
          workerId,
          exitCode: code,
        });

        // Remove from pool
        this.workers.delete(workerId);

        // Create replacement worker if needed
        if (this.workers.size < this.config.minWorkers) {
          this.createWorker().catch((err) => {
            logger.error('Failed to create replacement worker', {
              error: err.message,
            });
          });
        }
      }
    });
  }

  /**
   * Handles a message from a worker.
   *
   * @param {string} workerId - The worker ID
   * @param {WorkerResponse} response - The worker response
   * @private
   */
  private handleWorkerMessage(workerId: string, response: WorkerResponse): void {
    const metadata = this.workers.get(workerId);
    if (!metadata) {
      logger.warn('Received message from unknown worker', { workerId });
      return;
    }

    // Update worker status
    metadata.status = WorkerStatus.IDLE;
    metadata.lastActivity = Date.now();
    metadata.currentTaskId = undefined;

    // Complete the task
    if (isSuccessResponse(response)) {
      metadata.tasksCompleted++;
      this.taskQueue.completeTask(response.id, response.result);

      if (this.config.enablePerformanceTracking && response.performance) {
        logger.debug('Task completed with performance metrics', {
          taskId: response.id,
          workerId,
          executionTime: response.performance.executionTime + 'ms',
        });
      }
    } else {
      metadata.tasksFailed++;
      this.taskQueue.failTask(response.id, new Error(response.error));
    }

    // Schedule next task for this worker
    this.scheduleNextTask();
  }

  /**
   * Recycles a worker (terminates and creates a new one).
   *
   * @param {string} workerId - The worker to recycle
   * @private
   */
  private async recycleWorker(workerId: string): Promise<void> {
    logger.info('Recycling worker', { workerId });

    const metadata = this.workers.get(workerId);
    if (!metadata) {
      return;
    }

    // Settle the readyPromise so any pending dispatcher waiting on this
    // worker fails fast instead of hanging until the 5s ready timeout.
    metadata.abandonReady?.(
      new Error(`Worker ${workerId} recycled before/while ready`)
    );

    // Remove all event listeners to prevent memory leaks
    metadata.worker.removeAllListeners('message');
    metadata.worker.removeAllListeners('error');
    metadata.worker.removeAllListeners('exit');

    // Free the worker slot synchronously BEFORE awaiting terminate. This is
    // the property the abort path relies on: aborting an in-flight task must
    // drop busyWorkers immediately, not after the (potentially slow)
    // worker_threads.terminate() round-trip resolves. We then fire-and-forget
    // the actual termination — the worker reference is unreachable from the
    // pool, so any further events are ignored.
    this.workers.delete(workerId);

    // Terminate the worker (async; does not block slot release).
    metadata.worker.terminate().catch((err) => {
      logger.warn('Worker terminate() rejected during recycle', {
        workerId,
        error: err instanceof Error ? err.message : String(err),
      });
    });

    // Create replacement if pool is below minimum
    if (this.workers.size < this.config.minWorkers && !this.shuttingDown) {
      await this.createWorker();
    }
  }

  /**
   * Executes an operation using the worker pool.
   *
   * @template T - The result type
   * @param {Object} request - The operation request
   * @param {OperationType} request.operation - Type of operation
   * @param {any} request.data - Operation data
   * @param {number} [request.priority] - Task priority (higher = more urgent)
   * @returns {Promise<T>} The operation result
   *
   * @example
   * ```typescript
   * const result = await pool.execute({
   *   operation: OperationType.MATRIX_MULTIPLY,
   *   data: { matrixA, matrixB },
   *   priority: 10
   * });
   * ```
   */
  async execute<T extends WorkerResult>(request: {
    operation: OperationType;
    data: any;
    priority?: number;
    /**
     * Optional abort signal. When aborted, the task is cancelled:
     * - if pending, it is removed from the queue
     * - if active, the worker thread is forcibly terminated and replaced,
     *   freeing the worker slot immediately rather than waiting for the
     *   30s task timeout. Required for the DoS-protection abort path.
     */
    signal?: AbortSignal;
  }): Promise<T> {
    if (!this.initialized) {
      throw new WasmError('WorkerPool not initialized. Call initialize() first.');
    }

    if (this.shuttingDown) {
      throw new WasmError('WorkerPool is shutting down. Cannot accept new tasks.');
    }

    if (request.signal?.aborted) {
      throw new Error('Task cancelled before submission');
    }

    // On-demand worker creation: if pool is empty (minWorkers = 0), create a worker
    if (this.workers.size === 0 && !this.shuttingDown) {
      logger.debug('Pool empty, creating worker on-demand');
      await this.createWorker();
    }

    const taskId = `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    return new Promise<T>((resolve, reject) => {
      const task: Task = {
        id: taskId,
        operation: request.operation,
        data: request.data,
        resolve: resolve as (result: WorkerResult) => void,
        reject,
        priority: request.priority,
        createdAt: Date.now(),
        trackPerformance: this.config.enablePerformanceTracking,
      };

      // Wire abort -> cancel + recycle worker
      if (request.signal) {
        const onAbort = (): void => {
          // Capture worker (if active) BEFORE cancelTask removes it.
          const info = this.taskQueue.getTaskInfo(taskId);
          const worker = info?.status === 'active' ? info.worker : undefined;
          const wasCancelled = this.taskQueue.cancelTask(taskId, 'aborted');
          if (wasCancelled && worker) {
            this.recycleWorker(worker.id).catch((err) => {
              logger.error('Failed to recycle worker after abort', {
                workerId: worker.id,
                error: err instanceof Error ? err.message : String(err),
              });
            });
          }
        };
        request.signal.addEventListener('abort', onAbort, { once: true });
      }

      // Enqueue the task
      this.taskQueue.enqueue(task);

      // Try to schedule it immediately
      this.scheduleNextTask();
    });
  }

  /**
   * Schedules the next task from the queue.
   *
   * @private
   */
  private scheduleNextTask(): void {
    const workers = Array.from(this.workers.values());

    // Try to schedule tasks while we have idle workers and pending tasks
    while (this.taskQueue.scheduleNext(workers)) {
      // Task was scheduled, continue scheduling
      const idleWorkers = workers.filter((w) => w.status === WorkerStatus.IDLE);

      // Create more workers if needed and possible
      if (
        idleWorkers.length === 0 &&
        this.taskQueue.size() > 0 &&
        this.workers.size < this.config.maxWorkers
      ) {
        this.createWorker()
          .then(() => {
            this.scheduleNextTask();
          })
          .catch((err) => {
            logger.error('Failed to create worker during scheduling', {
              error: err instanceof Error ? err.message : String(err),
            });
          });
        break;
      }

      if (idleWorkers.length === 0) {
        break; // No more idle workers
      }
    }

    // Send tasks to workers. Each postMessage is gated on the worker's
    // readyPromise so the very first task on a freshly-spawned worker
    // doesn't race the worker's async WASM init. For warm workers the
    // promise is already resolved, so the await is effectively free.
    for (const metadata of workers) {
      if (metadata.status === WorkerStatus.BUSY && metadata.currentTaskId) {
        const taskInfo = this.taskQueue.getTaskInfo(metadata.currentTaskId);
        if (taskInfo && taskInfo.status === 'active' && taskInfo.task) {
          const workerRequest: WorkerRequest = {
            id: taskInfo.task.id,
            operation: taskInfo.task.operation,
            data: taskInfo.task.data,
            trackPerformance: taskInfo.task.trackPerformance,
          };

          this.dispatchWhenReady(metadata, workerRequest);
        }
      }
    }
  }

  /**
   * Posts a task message to a worker once it has signaled ready.
   *
   * For warm workers (readyPromise already resolved) this awaits a
   * pre-settled promise — essentially a microtask. For freshly-spawned
   * workers it blocks until `{type:'ready'}` arrives or the 5s ready
   * timeout fires. On timeout, the in-flight task is failed and the
   * wedged worker is recycled so capacity is restored.
   *
   * @param metadata - Worker the request is bound for
   * @param request - The task payload to post
   * @private
   */
  private dispatchWhenReady(
    metadata: WorkerMetadata,
    request: WorkerRequest
  ): void {
    metadata.readyPromise.then(
      () => {
        // Re-check the world: while we awaited ready, the worker may
        // have been recycled or its task aborted/cancelled. Skip the
        // post if either is true to avoid postMessage on a dead worker
        // or duplicate dispatch on a reused slot.
        if (!this.workers.has(metadata.id)) {
          return;
        }
        if (metadata.currentTaskId !== request.id) {
          return;
        }
        try {
          metadata.worker.postMessage(request);
        } catch (err) {
          logger.error('Failed to postMessage to worker after ready', {
            workerId: metadata.id,
            taskId: request.id,
            error: err instanceof Error ? err.message : String(err),
          });
          this.taskQueue.failTask(
            request.id,
            err instanceof Error ? err : new Error(String(err))
          );
          this.recycleWorker(metadata.id).catch((e) => {
            logger.error('Failed to recycle worker after postMessage failure', {
              workerId: metadata.id,
              error: e instanceof Error ? e.message : String(e),
            });
          });
        }
      },
      (err: Error) => {
        // Ready timed out (or was abandoned by recycle/shutdown). Fail
        // the task that was queued onto this worker and recycle so a
        // fresh worker can pick up future work.
        logger.error('Worker readyPromise rejected before dispatch', {
          workerId: metadata.id,
          taskId: request.id,
          error: err.message,
        });
        this.taskQueue.failTask(request.id, err);
        if (this.workers.has(metadata.id)) {
          this.recycleWorker(metadata.id).catch((e) => {
            logger.error('Failed to recycle worker after ready timeout', {
              workerId: metadata.id,
              error: e instanceof Error ? e.message : String(e),
            });
          });
        }
      }
    );
  }

  /**
   * Starts monitoring for idle workers.
   *
   * Workers idle longer than `workerIdleTimeout` may be terminated
   * to free resources (as long as pool stays above minimum size).
   *
   * @private
   */
  private startIdleMonitoring(): void {
    this.idleCheckInterval = setInterval(() => {
      if (this.shuttingDown) {
        return;
      }

      const now = Date.now();

      for (const [workerId, metadata] of this.workers.entries()) {
        const idleTime = now - metadata.lastActivity;

        // Terminate idle workers if pool above minimum
        if (
          metadata.status === WorkerStatus.IDLE &&
          idleTime > this.config.workerIdleTimeout &&
          this.workers.size > this.config.minWorkers
        ) {
          logger.debug('Terminating idle worker', {
            workerId,
            idleTime: `${idleTime}ms`,
          });

          // Settle readyPromise (no-op if already resolved) before
          // tearing down listeners so any awaiter fails fast.
          metadata.abandonReady?.(
            new Error(`Worker ${workerId} terminated for idleness`)
          );

          // Remove event listeners to prevent memory leaks
          metadata.worker.removeAllListeners('message');
          metadata.worker.removeAllListeners('error');
          metadata.worker.removeAllListeners('exit');

          metadata.worker.terminate();
          this.workers.delete(workerId);
        }
      }
    }, 10000); // Check every 10 seconds
  }

  /**
   * Gets current pool statistics.
   *
   * @returns {WorkerPoolStats} Pool statistics
   */
  getStats(): WorkerPoolStats {
    const idleWorkers = Array.from(this.workers.values()).filter(
      (w) => w.status === WorkerStatus.IDLE
    ).length;

    const busyWorkers = Array.from(this.workers.values()).filter(
      (w) => w.status === WorkerStatus.BUSY
    ).length;

    const queueStats = this.taskQueue.getStats();

    // Mean of completed-task durations sourced from TaskQueue, which sums
    // per-task wall-clock time inside completeTask(). Replaces the prior
    // `this.createdAt / totalTasks` calculation, which divided an epoch
    // timestamp by a counter and produced values ~10^12 too large.
    const avgTime = queueStats.avgExecutionTimeMs;

    return {
      totalWorkers: this.workers.size,
      idleWorkers,
      busyWorkers,
      queueSize: queueStats.pending,
      tasksCompleted: queueStats.totalCompleted,
      tasksFailed: queueStats.totalFailed,
      avgExecutionTime: avgTime,
      uptime: Date.now() - this.createdAt,
    };
  }

  /**
   * Shuts down the worker pool gracefully.
   *
   * **Shutdown process:**
   * 1. Stop accepting new tasks
   * 2. Wait for active tasks to complete (with timeout)
   * 3. Cancel pending tasks
   * 4. Terminate all workers
   *
   * @param {number} [gracePeriod=5000] - Time to wait for active tasks (ms)
   * @returns {Promise<void>}
   */
  async shutdown(gracePeriod: number = 5000): Promise<void> {
    if (this.shuttingDown) {
      logger.warn('WorkerPool already shutting down');
      return;
    }

    this.shuttingDown = true;

    logger.info('Shutting down worker pool...', {
      activeWorkers: this.workers.size,
      pendingTasks: this.taskQueue.size(),
      activeTasks: this.taskQueue.activeCount(),
    });

    // Stop idle monitoring
    if (this.idleCheckInterval) {
      clearInterval(this.idleCheckInterval);
    }

    // Wait for active tasks with timeout
    const startTime = Date.now();
    while (this.taskQueue.activeCount() > 0 && Date.now() - startTime < gracePeriod) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Cancel any remaining tasks
    if (!this.taskQueue.isEmpty()) {
      this.taskQueue.cancelAll('Worker pool shutting down');
    }

    // Terminate all workers (clean up event listeners first)
    const terminatePromises: Promise<number>[] = [];
    for (const metadata of this.workers.values()) {
      // Settle readyPromise so any straggler dispatcher unblocks.
      metadata.abandonReady?.(
        new Error(`Worker ${metadata.id} terminated during shutdown`)
      );

      // Remove all event listeners to prevent memory leaks
      metadata.worker.removeAllListeners('message');
      metadata.worker.removeAllListeners('error');
      metadata.worker.removeAllListeners('exit');

      terminatePromises.push(metadata.worker.terminate());
    }

    await Promise.all(terminatePromises);

    this.workers.clear();
    this.initialized = false;

    logger.info('WorkerPool shut down successfully');
  }

  /**
   * Checks if the pool is initialized.
   *
   * @returns {boolean} True if initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Checks if the pool is shutting down.
   *
   * @returns {boolean} True if shutting down
   */
  isShuttingDown(): boolean {
    return this.shuttingDown;
  }

  /**
   * Gets the number of available workers.
   *
   * @returns {number} Number of available (idle) workers
   */
  getAvailableWorkerCount(): number {
    return Array.from(this.workers.values()).filter((w) => w.status === WorkerStatus.IDLE)
      .length;
  }

  /**
   * Gets the number of pending tasks.
   *
   * @returns {number} Number of tasks in queue
   */
  getPendingTaskCount(): number {
    return this.taskQueue.size();
  }
}
