/**
 * @file backpressure.ts
 * @description Backpressure management for worker task queue
 *
 * Implements intelligent backpressure strategies to handle queue overflow
 * gracefully, preventing system overload and providing better user experience.
 *
 * @module workers/backpressure
 * @since 3.2.0
 */

import { EventEmitter } from 'events';
import type { Task } from './worker-types.js';
import { logger } from '../shared/logger.js';

/**
 * Backpressure strategies for handling queue overflow.
 *
 * @enum {string}
 */
export enum BackpressureStrategy {
  /** Reject new requests immediately with retry-after header */
  REJECT = 'REJECT',

  /** Wait for queue to drain before accepting request */
  WAIT = 'WAIT',

  /** Drop lowest priority task to make room for higher priority */
  SHED = 'SHED',
}

/**
 * Configuration for backpressure queue.
 *
 * @interface BackpressureConfig
 */
export interface BackpressureConfig {
  /** Maximum queue size before backpressure activates */
  maxSize: number;

  /** Strategy to use when queue is full */
  strategy: BackpressureStrategy;

  /** Maximum time to wait in WAIT strategy (ms) */
  maxWaitTime?: number;

  /** Threshold for drain events (0-1, e.g., 0.2 = 20% full) */
  drainThreshold?: number;
}

/**
 * Options for enqueueing a task.
 *
 * @interface EnqueueOptions
 */
export interface EnqueueOptions {
  /** Task priority (higher = more important) */
  priority?: number;

  /** Maximum wait time for this specific task (ms) */
  timeout?: number;
}

/**
 * Queued task with metadata.
 *
 * @interface QueuedTask
 */
interface QueuedTask {
  task: Task;
  priority: number;
  enqueuedAt: number;
}

/**
 * Error thrown when backpressure is applied.
 *
 * @class BackpressureError
 */
export class BackpressureError extends Error {
  name = 'BackpressureError';

  constructor(
    message: string,
    public readonly metadata: {
      queueSize: number;
      maxSize: number;
      suggestedRetryAfter: number;
      strategy: BackpressureStrategy;
    }
  ) {
    super(message);
    Object.setPrototypeOf(this, BackpressureError.prototype);
  }
}

/**
 * Backpressure-aware task queue.
 *
 * Implements three strategies for handling queue overflow:
 * - **REJECT**: Return error with retry-after suggestion
 * - **WAIT**: Block until queue has space
 * - **SHED**: Drop lowest priority task to make room
 *
 * @example
 * ```typescript
 * const queue = new BackpressureQueue({
 *   maxSize: 100,
 *   strategy: BackpressureStrategy.REJECT,
 * });
 *
 * // Listen for drain events
 * queue.on('drain', ({ queueSize }) => {
 *   console.log(`Queue drained to ${queueSize}`);
 * });
 *
 * // Enqueue task with priority
 * await queue.enqueue(task, { priority: 5 });
 *
 * // Dequeue highest priority task
 * const nextTask = queue.dequeue();
 * ```
 */
export class BackpressureQueue extends EventEmitter {
  private queue: Array<QueuedTask> = [];
  private readonly config: Required<BackpressureConfig>;
  private taskDurations: number[] = [];
  private wasAboveThreshold = false;

  constructor(config: BackpressureConfig) {
    super();

    this.config = {
      maxSize: config.maxSize,
      strategy: config.strategy,
      maxWaitTime: config.maxWaitTime || 30000,
      drainThreshold: config.drainThreshold || 0.2,
    };
  }

  /**
   * Enqueues a task with backpressure handling.
   *
   * @param task - Task to enqueue
   * @param options - Enqueue options
   * @returns Promise that resolves when task is enqueued
   * @throws BackpressureError if queue is full and strategy is REJECT
   *
   * @example
   * ```typescript
   * try {
   *   await queue.enqueue(task, { priority: 10 });
   * } catch (error) {
   *   if (error instanceof BackpressureError) {
   *     console.log(`Retry after ${error.metadata.suggestedRetryAfter}ms`);
   *   }
   * }
   * ```
   */
  async enqueue(task: Task, options: EnqueueOptions = {}): Promise<void> {
    if (this.queue.length >= this.config.maxSize) {
      return this.handleBackpressure(task, options);
    }

    this.addToQueue(task, options.priority || 0);
  }

  /**
   * Dequeues the highest priority task.
   *
   * @returns The next task or null if queue is empty
   *
   * @example
   * ```typescript
   * const task = queue.dequeue();
   * if (task) {
   *   // Process task
   * }
   * ```
   */
  dequeue(): Task | null {
    if (this.queue.length === 0) {
      return null;
    }

    // Sort by priority (descending), then by enqueue time (ascending - FIFO)
    this.queue.sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority; // Higher priority first
      }
      return a.enqueuedAt - b.enqueuedAt; // FIFO within same priority
    });

    const queued = this.queue.shift();

    if (queued) {
      this.checkDrainThreshold();
      return queued.task;
    }

    return null;
  }

  /**
   * Gets current queue size.
   *
   * @returns Number of tasks in queue
   */
  get size(): number {
    return this.queue.length;
  }

  /**
   * Checks if queue is full.
   *
   * @returns True if queue is at max capacity
   */
  get isFull(): boolean {
    return this.queue.length >= this.config.maxSize;
  }

  /**
   * Handles backpressure based on configured strategy.
   *
   * @private
   */
  private async handleBackpressure(
    task: Task,
    options: EnqueueOptions
  ): Promise<void> {
    logger.warn('Queue full, applying backpressure', {
      size: this.queue.length,
      maxSize: this.config.maxSize,
      strategy: this.config.strategy,
    });

    switch (this.config.strategy) {
      case BackpressureStrategy.REJECT:
        return this.rejectRequest(task);

      case BackpressureStrategy.WAIT:
        return this.waitForSpace(task, options);

      case BackpressureStrategy.SHED:
        return this.shedLowestPriority(task, options);
    }
  }

  /**
   * REJECT strategy: Reject request with retry suggestion.
   *
   * @private
   */
  private rejectRequest(task: Task): void {
    const retryAfter = this.estimateWaitTime();

    const error = new BackpressureError(
      'Queue is full, please retry later',
      {
        queueSize: this.queue.length,
        maxSize: this.config.maxSize,
        suggestedRetryAfter: retryAfter,
        strategy: BackpressureStrategy.REJECT,
      }
    );

    task.reject(error);

    this.emit('reject', {
      queueSize: this.queue.length,
      retryAfter,
    });

    logger.info('Request rejected due to backpressure', {
      retryAfter,
      queueSize: this.queue.length,
    });
  }

  /**
   * WAIT strategy: Wait for queue to drain.
   *
   * @private
   */
  private async waitForSpace(
    task: Task,
    options: EnqueueOptions
  ): Promise<void> {
    const timeout = options.timeout || this.config.maxWaitTime;
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        const elapsed = Date.now() - startTime;

        if (this.queue.length < this.config.maxSize) {
          clearInterval(checkInterval);
          this.addToQueue(task, options.priority || 0);

          logger.info('Request accepted after waiting', {
            waitTime: elapsed,
            queueSize: this.queue.length,
          });

          resolve();
        } else if (elapsed >= timeout) {
          clearInterval(checkInterval);

          const error = new BackpressureError(
            'Timeout waiting for queue space',
            {
              queueSize: this.queue.length,
              maxSize: this.config.maxSize,
              suggestedRetryAfter: this.estimateWaitTime(),
              strategy: BackpressureStrategy.WAIT,
            }
          );

          reject(error);
        }
      }, 100); // Check every 100ms
    });
  }

  /**
   * SHED strategy: Drop lowest priority task.
   *
   * @private
   */
  private shedLowestPriority(
    task: Task,
    options: EnqueueOptions
  ): void {
    // Find lowest priority task
    let lowestPriorityIndex = 0;
    let lowestPriority = this.queue[0]?.priority || 0;

    for (let i = 1; i < this.queue.length; i++) {
      if (this.queue[i].priority < lowestPriority) {
        lowestPriority = this.queue[i].priority;
        lowestPriorityIndex = i;
      }
    }

    // Only shed if new task has higher priority
    const newTaskPriority = options.priority || 0;

    if (newTaskPriority > lowestPriority) {
      const dropped = this.queue.splice(lowestPriorityIndex, 1)[0];

      const error = new BackpressureError(
        'Task dropped due to higher priority request',
        {
          queueSize: this.queue.length,
          maxSize: this.config.maxSize,
          suggestedRetryAfter: 0,
          strategy: BackpressureStrategy.SHED,
        }
      );

      dropped.task.reject(error);

      logger.info('Dropped low priority task', {
        droppedPriority: lowestPriority,
        newPriority: newTaskPriority,
      });

      this.addToQueue(task, newTaskPriority);

      this.emit('shed', {
        droppedPriority: lowestPriority,
        newPriority: newTaskPriority,
      });
    } else {
      // New task has lower priority, reject it
      const error = new BackpressureError(
        'Task priority too low',
        {
          queueSize: this.queue.length,
          maxSize: this.config.maxSize,
          suggestedRetryAfter: this.estimateWaitTime(),
          strategy: BackpressureStrategy.SHED,
        }
      );

      task.reject(error);

      logger.info('Rejected low priority task', {
        taskPriority: newTaskPriority,
        lowestQueuePriority: lowestPriority,
      });
    }
  }

  /**
   * Adds task to queue.
   *
   * @private
   */
  private addToQueue(task: Task, priority: number): void {
    this.queue.push({
      task,
      priority,
      enqueuedAt: Date.now(),
    });

    // Track if we're above drain threshold
    const threshold = this.config.maxSize * this.config.drainThreshold;
    if (this.queue.length > threshold) {
      this.wasAboveThreshold = true;
    }
  }

  /**
   * Checks if queue has drained below threshold.
   *
   * @private
   */
  private checkDrainThreshold(): void {
    const threshold = this.config.maxSize * this.config.drainThreshold;

    if (this.wasAboveThreshold && this.queue.length <= threshold) {
      this.emit('drain', {
        queueSize: this.queue.length,
        maxSize: this.config.maxSize,
      });

      this.wasAboveThreshold = false;

      logger.info('Queue drained below threshold', {
        size: this.queue.length,
        threshold,
      });
    }
  }

  /**
   * Estimates wait time based on average task duration.
   *
   * @private
   * @returns Estimated wait time in milliseconds
   */
  private estimateWaitTime(): number {
    if (this.taskDurations.length === 0) {
      // No data, estimate based on queue size
      return this.queue.length * 100; // 100ms per task estimate
    }

    // Calculate average task duration
    const avg =
      this.taskDurations.reduce((a, b) => a + b, 0) /
      this.taskDurations.length;

    // Multiply by queue size
    return Math.ceil(avg * this.queue.length);
  }

  /**
   * Records task completion time for wait estimation.
   *
   * @param durationMs - Task duration in milliseconds
   *
   * @example
   * ```typescript
   * const start = Date.now();
   * await processTask(task);
   * queue.recordTaskDuration(Date.now() - start);
   * ```
   */
  recordTaskDuration(durationMs: number): void {
    this.taskDurations.push(durationMs);

    // Keep only last 100 durations for rolling average
    if (this.taskDurations.length > 100) {
      this.taskDurations.shift();
    }
  }

  /**
   * Gets queue statistics.
   *
   * @returns Queue statistics including size, strategy, and wait estimates
   *
   * @example
   * ```typescript
   * const stats = queue.getStats();
   * console.log(`Queue: ${stats.size}/${stats.maxSize}`);
   * console.log(`Strategy: ${stats.strategy}`);
   * console.log(`Estimated wait: ${stats.estimatedWaitTime}ms`);
   * ```
   */
  getStats(): {
    size: number;
    maxSize: number;
    strategy: BackpressureStrategy;
    avgTaskDuration: number;
    estimatedWaitTime: number;
  } {
    const avgDuration =
      this.taskDurations.length > 0
        ? this.taskDurations.reduce((a, b) => a + b, 0) /
          this.taskDurations.length
        : 0;

    return {
      size: this.queue.length,
      maxSize: this.config.maxSize,
      strategy: this.config.strategy,
      avgTaskDuration: avgDuration,
      estimatedWaitTime: this.estimateWaitTime(),
    };
  }

  /**
   * Clears all tasks from the queue.
   *
   * @param rejectPending - If true, reject all pending tasks with BackpressureError
   *
   * @example
   * ```typescript
   * // Clear queue and reject all pending
   * queue.clear(true);
   * ```
   */
  clear(rejectPending = false): void {
    if (rejectPending) {
      const error = new BackpressureError(
        'Queue cleared',
        {
          queueSize: 0,
          maxSize: this.config.maxSize,
          suggestedRetryAfter: 0,
          strategy: this.config.strategy,
        }
      );

      for (const queued of this.queue) {
        queued.task.reject(error);
      }
    }

    this.queue = [];
    this.wasAboveThreshold = false;

    logger.info('Queue cleared', { rejectPending });
  }
}
