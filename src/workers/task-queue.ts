/**
 * @file task-queue.ts
 * @description Task queue implementation for managing parallel work distribution
 *
 * This module provides a priority-based task queue that:
 * - Manages pending tasks waiting for worker availability
 * - Supports task prioritization
 * - Handles task timeouts
 * - Provides fair scheduling across operations
 *
 * @module workers/task-queue
 * @since 3.0.0
 */

import { Task, WorkerMetadata, WorkerStatus } from './worker-types.js';
import { logger } from '../utils.js';
import { TimeoutError } from '../errors.js';

/**
 * Priority-based task queue for worker pool.
 *
 * **Features:**
 * - Priority-based scheduling (higher priority tasks execute first)
 * - FIFO ordering within same priority level
 * - Task timeout management
 * - Queue size limits
 * - Performance metrics
 *
 * @class TaskQueue
 * @since 3.0.0
 */
export class TaskQueue {
  /** Queue of pending tasks, sorted by priority */
  private queue: Task[] = [];

  /** Map of active tasks being processed */
  private activeTasks: Map<string, { task: Task; worker: WorkerMetadata; startTime: number }> =
    new Map();

  /** Map of task timeouts */
  private taskTimeouts: Map<string, NodeJS.Timeout> = new Map();

  /** Maximum queue size */
  private readonly maxQueueSize: number;

  /** Default task timeout in milliseconds */
  private readonly taskTimeout: number;

  /**
   * Optional callback invoked when a task times out while running on a
   * worker. The pool uses this to forcibly recycle the worker thread —
   * the worker is still running CPU-bound JS and cannot be told to stop
   * cooperatively, so the only way to free the slot is `worker.terminate()`.
   * Without this callback the worker would remain in ERROR state and never
   * be reaped, leaking the slot (DoS).
   */
  private onTaskTimeout?: (workerId: string, taskId: string) => void;

  /** Statistics */
  private stats = {
    totalEnqueued: 0,
    totalCompleted: 0,
    totalFailed: 0,
    totalTimedOut: 0,
    /**
     * Cumulative wall-clock duration of all *successfully completed* tasks
     * in milliseconds. Used to compute a stable mean execution time.
     * Only completion durations are summed here — failed/timed-out tasks
     * are excluded so the metric reflects healthy throughput.
     */
    totalExecutionTimeMs: 0,
  };

  /**
   * Creates a new task queue.
   *
   * @param {Object} config - Queue configuration
   * @param {number} [config.maxQueueSize=1000] - Maximum pending tasks
   * @param {number} [config.taskTimeout=30000] - Task timeout in ms
   */
  constructor(
    config: {
      maxQueueSize?: number;
      taskTimeout?: number;
      onTaskTimeout?: (workerId: string, taskId: string) => void;
    } = {}
  ) {
    this.maxQueueSize = config.maxQueueSize || 1000;
    this.taskTimeout = config.taskTimeout || 30000;
    this.onTaskTimeout = config.onTaskTimeout;

    logger.debug('TaskQueue initialized', {
      maxQueueSize: this.maxQueueSize,
      taskTimeout: this.taskTimeout,
    });
  }

  /**
   * Registers (or replaces) the callback invoked on task timeout.
   * Useful for late-binding when WorkerPool wires itself up after queue
   * construction.
   */
  setTimeoutCallback(cb: (workerId: string, taskId: string) => void): void {
    this.onTaskTimeout = cb;
  }

  /**
   * Enqueues a new task.
   *
   * Tasks are inserted in priority order (higher priority = earlier execution).
   * Within the same priority, FIFO order is maintained.
   *
   * @param {Task} task - The task to enqueue
   * @throws {Error} If queue is full
   *
   * @example
   * ```typescript
   * const task = {
   *   id: 'task-1',
   *   operation: OperationType.MATRIX_MULTIPLY,
   *   data: { matrixA, matrixB },
   *   resolve: (result) => console.log(result),
   *   reject: (error) => console.error(error),
   *   priority: 10,
   *   createdAt: Date.now()
   * };
   * queue.enqueue(task);
   * ```
   */
  enqueue(task: Task): void {
    if (this.queue.length >= this.maxQueueSize) {
      const error = new Error(
        `Task queue full (max: ${this.maxQueueSize}). Rejecting task ${task.id}`
      );
      logger.error('Queue full, rejecting task', {
        taskId: task.id,
        queueSize: this.queue.length,
        maxQueueSize: this.maxQueueSize,
      });
      task.reject(error);
      this.stats.totalFailed++;
      return;
    }

    const priority = task.priority || 0;

    // Find insertion point to maintain priority order
    let insertIndex = this.queue.length;
    for (let i = 0; i < this.queue.length; i++) {
      const queuedPriority = this.queue[i].priority || 0;
      if (priority > queuedPriority) {
        insertIndex = i;
        break;
      }
    }

    // Insert at the appropriate position
    this.queue.splice(insertIndex, 0, task);
    this.stats.totalEnqueued++;

    logger.debug('Task enqueued', {
      taskId: task.id,
      operation: task.operation,
      priority,
      queuePosition: insertIndex,
      queueSize: this.queue.length,
    });
  }

  /**
   * Dequeues the next task from the queue.
   *
   * Returns the highest priority task. If multiple tasks have the
   * same priority, returns the oldest (FIFO).
   *
   * @returns {Task | null} The next task, or null if queue is empty
   */
  dequeue(): Task | null {
    if (this.queue.length === 0) {
      return null;
    }

    // Remove and return first task (already sorted by priority)
    const task = this.queue.shift()!;

    logger.debug('Task dequeued', {
      taskId: task.id,
      operation: task.operation,
      remainingInQueue: this.queue.length,
    });

    return task;
  }

  /**
   * Assigns a task to a worker and starts tracking it.
   *
   * @param {Task} task - The task to assign
   * @param {WorkerMetadata} worker - The worker to assign the task to
   */
  assignTask(task: Task, worker: WorkerMetadata): void {
    const startTime = Date.now();

    this.activeTasks.set(task.id, { task, worker, startTime });

    // Set up timeout
    const timeout = setTimeout(() => {
      this.handleTaskTimeout(task.id);
    }, this.taskTimeout);

    this.taskTimeouts.set(task.id, timeout);

    logger.debug('Task assigned to worker', {
      taskId: task.id,
      workerId: worker.id,
      operation: task.operation,
      timeout: this.taskTimeout,
    });
  }

  /**
   * Marks a task as completed successfully.
   *
   * @param {string} taskId - The task ID
   * @param {any} result - The task result
   */
  completeTask(taskId: string, result: any): void {
    const activeTask = this.activeTasks.get(taskId);
    if (!activeTask) {
      logger.warn('Attempted to complete unknown task', { taskId });
      return;
    }

    const { task, startTime } = activeTask;
    const duration = Date.now() - startTime;

    // Clear timeout
    const timeout = this.taskTimeouts.get(taskId);
    if (timeout) {
      clearTimeout(timeout);
      this.taskTimeouts.delete(taskId);
    }

    // Remove from active tasks
    this.activeTasks.delete(taskId);

    // Resolve the task
    task.resolve(result);

    // Accumulate execution time *before* incrementing the completed counter
    // so any consumer reading getStats() sees a coherent (sum, count) pair.
    this.stats.totalExecutionTimeMs += duration;
    this.stats.totalCompleted++;

    logger.debug('Task completed', {
      taskId,
      operation: task.operation,
      duration: `${duration}ms`,
      workerId: activeTask.worker.id,
    });
  }

  /**
   * Marks a task as failed.
   *
   * @param {string} taskId - The task ID
   * @param {Error} error - The error that occurred
   */
  failTask(taskId: string, error: Error): void {
    const activeTask = this.activeTasks.get(taskId);
    if (!activeTask) {
      logger.warn('Attempted to fail unknown task', { taskId });
      return;
    }

    const { task, startTime } = activeTask;
    const duration = Date.now() - startTime;

    // Clear timeout
    const timeout = this.taskTimeouts.get(taskId);
    if (timeout) {
      clearTimeout(timeout);
      this.taskTimeouts.delete(taskId);
    }

    // Remove from active tasks
    this.activeTasks.delete(taskId);

    // Reject the task
    task.reject(error);

    this.stats.totalFailed++;

    logger.error('Task failed', {
      taskId,
      operation: task.operation,
      duration: `${duration}ms`,
      error: error.message,
      workerId: activeTask.worker.id,
    });
  }

  /**
   * Handles task timeout.
   *
   * @param {string} taskId - The task ID that timed out
   * @private
   */
  private handleTaskTimeout(taskId: string): void {
    const activeTask = this.activeTasks.get(taskId);
    if (!activeTask) {
      return; // Task already completed or failed
    }

    const { task, worker, startTime } = activeTask;
    const duration = Date.now() - startTime;

    logger.error('Task timed out', {
      taskId,
      operation: task.operation,
      timeout: this.taskTimeout,
      actualDuration: `${duration}ms`,
      workerId: worker.id,
    });

    // Mark worker as error state
    worker.status = WorkerStatus.ERROR;

    // Remove from active tasks
    this.activeTasks.delete(taskId);
    this.taskTimeouts.delete(taskId);

    // Reject with timeout error
    const error = new TimeoutError(
      `Task ${taskId} (${task.operation}) timed out after ${this.taskTimeout}ms`
    );
    task.reject(error);

    this.stats.totalTimedOut++;
    this.stats.totalFailed++;

    // Notify the pool so it can forcibly terminate the worker thread.
    // The worker is still running CPU-bound code and won't accept new work;
    // the slot must be reclaimed via `worker.terminate()`. Without this,
    // a steady stream of timing-out requests exhausts the worker pool
    // (DoS via worker-slot leak).
    if (this.onTaskTimeout) {
      try {
        this.onTaskTimeout(worker.id, taskId);
      } catch (cbErr) {
        logger.error('onTaskTimeout callback threw', {
          taskId,
          workerId: worker.id,
          error: cbErr instanceof Error ? cbErr.message : String(cbErr),
        });
      }
    }
  }

  /**
   * Cancels a task by ID. If the task is pending, it is removed from the
   * queue and rejected. If the task is active (running on a worker), the
   * task is removed from active tracking and rejected; the caller is
   * responsible for recycling the worker (since worker threads can't be
   * stopped cooperatively).
   *
   * @param taskId - The task to cancel
   * @param reason - Reason for cancellation (used in error message)
   * @returns true if the task was found and cancelled, false otherwise
   */
  cancelTask(taskId: string, reason: string = 'cancelled'): boolean {
    // Pending: remove from queue
    const pendingIdx = this.queue.findIndex((t) => t.id === taskId);
    if (pendingIdx !== -1) {
      const [task] = this.queue.splice(pendingIdx, 1);
      task.reject(new Error(`Task cancelled: ${reason}`));
      this.stats.totalFailed++;
      return true;
    }

    // Active: remove tracking, fire reject; pool must recycle the worker
    const activeTask = this.activeTasks.get(taskId);
    if (activeTask) {
      const timeout = this.taskTimeouts.get(taskId);
      if (timeout) {
        clearTimeout(timeout);
        this.taskTimeouts.delete(taskId);
      }
      this.activeTasks.delete(taskId);
      activeTask.task.reject(new Error(`Task cancelled: ${reason}`));
      this.stats.totalFailed++;
      return true;
    }

    return false;
  }

  /**
   * Gets the next available worker and assigns it a task.
   *
   * @param {WorkerMetadata[]} workers - Array of all workers
   * @returns {boolean} True if a task was assigned, false otherwise
   */
  scheduleNext(workers: WorkerMetadata[]): boolean {
    // Find idle workers
    const idleWorkers = workers.filter((w) => w.status === WorkerStatus.IDLE);

    if (idleWorkers.length === 0) {
      return false; // No idle workers
    }

    // Get next task
    const nextTask = this.dequeue();
    if (!nextTask) {
      return false; // No pending tasks
    }

    // Select worker (simple: first idle, could be more sophisticated)
    const worker = idleWorkers[0];

    // Update worker status
    worker.status = WorkerStatus.BUSY;
    worker.currentTaskId = nextTask.id;

    // Assign task
    this.assignTask(nextTask, worker);

    return true;
  }

  /**
   * Cancels all pending tasks.
   *
   * @param {string} reason - Reason for cancellation
   */
  cancelAll(reason: string): void {
    logger.warn('Canceling all pending tasks', {
      pendingCount: this.queue.length,
      activeCount: this.activeTasks.size,
      reason,
    });

    const error = new Error(`Task cancelled: ${reason}`);

    // Cancel pending tasks
    while (this.queue.length > 0) {
      const task = this.queue.shift()!;
      task.reject(error);
      this.stats.totalFailed++;
    }

    // Cancel active tasks
    for (const [taskId, activeTask] of this.activeTasks.entries()) {
      const timeout = this.taskTimeouts.get(taskId);
      if (timeout) {
        clearTimeout(timeout);
        this.taskTimeouts.delete(taskId);
      }

      activeTask.task.reject(error);
      this.stats.totalFailed++;
    }

    this.activeTasks.clear();
  }

  /**
   * Gets the current queue size (pending tasks).
   *
   * @returns {number} Number of pending tasks
   */
  size(): number {
    return this.queue.length;
  }

  /**
   * Gets the number of active (executing) tasks.
   *
   * @returns {number} Number of active tasks
   */
  activeCount(): number {
    return this.activeTasks.size;
  }

  /**
   * Checks if the queue is empty (no pending or active tasks).
   *
   * @returns {boolean} True if queue is empty
   */
  isEmpty(): boolean {
    return this.queue.length === 0 && this.activeTasks.size === 0;
  }

  /**
   * Gets queue statistics.
   *
   * @returns {Object} Queue statistics
   */
  getStats(): {
    pending: number;
    active: number;
    totalEnqueued: number;
    totalCompleted: number;
    totalFailed: number;
    totalTimedOut: number;
    successRate: string;
    avgExecutionTimeMs: number;
  } {
    const total = this.stats.totalCompleted + this.stats.totalFailed;
    const successRate = total > 0 ? (this.stats.totalCompleted / total) * 100 : 0;

    // Mean of completed-task durations. Guarded by max(1, …) to avoid
    // div-by-zero before any task has finished. Prior implementation in
    // worker-pool.ts used `createdAt / totalCompleted` (epoch-millis ÷
    // count), which over-reported by ~10^12 — see CHANGELOG entry.
    const avgExecutionTimeMs =
      this.stats.totalCompleted > 0
        ? this.stats.totalExecutionTimeMs / this.stats.totalCompleted
        : 0;

    return {
      pending: this.queue.length,
      active: this.activeTasks.size,
      totalEnqueued: this.stats.totalEnqueued,
      totalCompleted: this.stats.totalCompleted,
      totalFailed: this.stats.totalFailed,
      totalTimedOut: this.stats.totalTimedOut,
      successRate: successRate.toFixed(1) + '%',
      avgExecutionTimeMs,
    };
  }

  /**
   * Clears queue statistics.
   */
  resetStats(): void {
    this.stats = {
      totalEnqueued: 0,
      totalCompleted: 0,
      totalFailed: 0,
      totalTimedOut: 0,
      totalExecutionTimeMs: 0,
    };

    logger.debug('Queue statistics reset');
  }

  /**
   * Gets detailed information about a specific task.
   *
   * @param {string} taskId - The task ID
   * @returns {Object | null} Task information or null if not found
   */
  getTaskInfo(taskId: string): {
    status: 'pending' | 'active' | 'not_found';
    task?: Task;
    worker?: WorkerMetadata;
    startTime?: number;
    elapsedTime?: number;
  } | null {
    // Check if task is pending
    const pendingTask = this.queue.find((t) => t.id === taskId);
    if (pendingTask) {
      return {
        status: 'pending',
        task: pendingTask,
      };
    }

    // Check if task is active
    const activeTask = this.activeTasks.get(taskId);
    if (activeTask) {
      return {
        status: 'active',
        task: activeTask.task,
        worker: activeTask.worker,
        startTime: activeTask.startTime,
        elapsedTime: Date.now() - activeTask.startTime,
      };
    }

    return { status: 'not_found' };
  }
}
