/**
 * @file backpressure.test.ts
 * @description Unit tests for BackpressureQueue and backpressure strategies
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BackpressureQueue,
  BackpressureStrategy,
  BackpressureError,
} from '../../../src/workers/backpressure.js';
import type { Task } from '../../../src/workers/worker-types.js';

// Helper to create a mock task
function createMockTask(id: string): Task {
  return {
    id,
    operation: 'matrixMultiply' as const,
    data: { a: [[1]], b: [[1]] },
    resolve: vi.fn(),
    reject: vi.fn(),
  };
}

describe('BackpressureQueue', () => {
  describe('constructor', () => {
    it('should create queue with default configuration', () => {
      const queue = new BackpressureQueue({
        maxSize: 100,
        strategy: BackpressureStrategy.REJECT,
      });

      expect(queue).toBeDefined();
      expect(queue.size).toBe(0);
      expect(queue.isFull).toBe(false);
    });

    it('should create queue with custom drain threshold', () => {
      const queue = new BackpressureQueue({
        maxSize: 100,
        strategy: BackpressureStrategy.REJECT,
        drainThreshold: 0.5,
      });

      expect(queue).toBeDefined();
    });

    it('should create queue with custom max wait time', () => {
      const queue = new BackpressureQueue({
        maxSize: 100,
        strategy: BackpressureStrategy.WAIT,
        maxWaitTime: 5000,
      });

      expect(queue).toBeDefined();
    });
  });

  describe('enqueue and dequeue', () => {
    let queue: BackpressureQueue;

    beforeEach(() => {
      queue = new BackpressureQueue({
        maxSize: 10,
        strategy: BackpressureStrategy.REJECT,
      });
    });

    it('should enqueue and dequeue tasks', async () => {
      const task = createMockTask('task-1');

      await queue.enqueue(task);

      expect(queue.size).toBe(1);

      const dequeued = queue.dequeue();

      expect(dequeued).toBe(task);
      expect(queue.size).toBe(0);
    });

    it('should return null when dequeuing from empty queue', () => {
      const dequeued = queue.dequeue();

      expect(dequeued).toBeNull();
    });

    it('should track queue size correctly', async () => {
      const task1 = createMockTask('task-1');
      const task2 = createMockTask('task-2');
      const task3 = createMockTask('task-3');

      await queue.enqueue(task1);
      expect(queue.size).toBe(1);

      await queue.enqueue(task2);
      expect(queue.size).toBe(2);

      await queue.enqueue(task3);
      expect(queue.size).toBe(3);

      queue.dequeue();
      expect(queue.size).toBe(2);
    });

    it('should detect when queue is full', async () => {
      const smallQueue = new BackpressureQueue({
        maxSize: 2,
        strategy: BackpressureStrategy.REJECT,
      });

      await smallQueue.enqueue(createMockTask('task-1'));
      expect(smallQueue.isFull).toBe(false);

      await smallQueue.enqueue(createMockTask('task-2'));
      expect(smallQueue.isFull).toBe(true);
    });
  });

  describe('priority handling', () => {
    let queue: BackpressureQueue;

    beforeEach(() => {
      queue = new BackpressureQueue({
        maxSize: 10,
        strategy: BackpressureStrategy.REJECT,
      });
    });

    it('should dequeue highest priority task first', async () => {
      const lowPriority = createMockTask('low');
      const mediumPriority = createMockTask('medium');
      const highPriority = createMockTask('high');

      await queue.enqueue(lowPriority, { priority: 1 });
      await queue.enqueue(mediumPriority, { priority: 5 });
      await queue.enqueue(highPriority, { priority: 10 });

      const first = queue.dequeue();
      expect(first).toBe(highPriority);

      const second = queue.dequeue();
      expect(second).toBe(mediumPriority);

      const third = queue.dequeue();
      expect(third).toBe(lowPriority);
    });

    it('should use FIFO for same priority tasks', async () => {
      const task1 = createMockTask('task-1');
      const task2 = createMockTask('task-2');
      const task3 = createMockTask('task-3');

      await queue.enqueue(task1, { priority: 5 });
      await queue.enqueue(task2, { priority: 5 });
      await queue.enqueue(task3, { priority: 5 });

      expect(queue.dequeue()).toBe(task1);
      expect(queue.dequeue()).toBe(task2);
      expect(queue.dequeue()).toBe(task3);
    });

    it('should handle tasks with no priority (default 0)', async () => {
      const noPriority = createMockTask('no-priority');
      const withPriority = createMockTask('with-priority');

      await queue.enqueue(noPriority);
      await queue.enqueue(withPriority, { priority: 1 });

      expect(queue.dequeue()).toBe(withPriority);
      expect(queue.dequeue()).toBe(noPriority);
    });
  });

  describe('REJECT strategy', () => {
    let queue: BackpressureQueue;

    beforeEach(() => {
      queue = new BackpressureQueue({
        maxSize: 2,
        strategy: BackpressureStrategy.REJECT,
      });
    });

    it('should reject new tasks when queue is full', async () => {
      const task1 = createMockTask('task-1');
      const task2 = createMockTask('task-2');
      const task3 = createMockTask('task-3');

      await queue.enqueue(task1);
      await queue.enqueue(task2);

      // Queue is now full
      await queue.enqueue(task3);

      expect(task3.reject).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'BackpressureError',
          metadata: expect.objectContaining({
            strategy: BackpressureStrategy.REJECT,
            queueSize: 2,
            maxSize: 2,
          }),
        })
      );
    });

    it('should emit reject event when task is rejected', async () => {
      const task1 = createMockTask('task-1');
      const task2 = createMockTask('task-2');
      const task3 = createMockTask('task-3');

      const rejectHandler = vi.fn();
      queue.on('reject', rejectHandler);

      await queue.enqueue(task1);
      await queue.enqueue(task2);
      await queue.enqueue(task3);

      expect(rejectHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          queueSize: 2,
          retryAfter: expect.any(Number),
        })
      );
    });

    it('should provide retry-after suggestion', async () => {
      const task1 = createMockTask('task-1');
      const task2 = createMockTask('task-2');
      const task3 = createMockTask('task-3');

      await queue.enqueue(task1);
      await queue.enqueue(task2);
      await queue.enqueue(task3);

      expect(task3.reject).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            suggestedRetryAfter: expect.any(Number),
          }),
        })
      );
    });
  });

  describe('WAIT strategy', () => {
    it('should wait for space and eventually enqueue', async () => {
      const queue = new BackpressureQueue({
        maxSize: 2,
        strategy: BackpressureStrategy.WAIT,
        maxWaitTime: 1000,
      });

      const task1 = createMockTask('task-1');
      const task2 = createMockTask('task-2');
      const task3 = createMockTask('task-3');

      await queue.enqueue(task1);
      await queue.enqueue(task2);

      // Queue is full, task3 will wait
      const enqueuePromise = queue.enqueue(task3, { priority: 5 });

      // Simulate queue draining after 200ms
      setTimeout(() => {
        queue.dequeue();
      }, 200);

      await enqueuePromise;

      expect(queue.size).toBe(2); // task2 + task3
    });

    it('should timeout if queue does not drain in time', async () => {
      const queue = new BackpressureQueue({
        maxSize: 2,
        strategy: BackpressureStrategy.WAIT,
        maxWaitTime: 300,
      });

      const task1 = createMockTask('task-1');
      const task2 = createMockTask('task-2');
      const task3 = createMockTask('task-3');

      await queue.enqueue(task1);
      await queue.enqueue(task2);

      // Queue is full and won't drain
      await expect(queue.enqueue(task3)).rejects.toThrow(BackpressureError);
    });

    it('should respect custom timeout per task', async () => {
      const queue = new BackpressureQueue({
        maxSize: 2,
        strategy: BackpressureStrategy.WAIT,
        maxWaitTime: 5000, // Default high timeout
      });

      const task1 = createMockTask('task-1');
      const task2 = createMockTask('task-2');
      const task3 = createMockTask('task-3');

      await queue.enqueue(task1);
      await queue.enqueue(task2);

      // Override with custom short timeout
      await expect(
        queue.enqueue(task3, { timeout: 200 })
      ).rejects.toThrow(BackpressureError);
    });
  });

  describe('SHED strategy', () => {
    let queue: BackpressureQueue;

    beforeEach(() => {
      queue = new BackpressureQueue({
        maxSize: 3,
        strategy: BackpressureStrategy.SHED,
      });
    });

    it('should drop lowest priority task for higher priority', async () => {
      const lowPriority = createMockTask('low');
      const mediumPriority = createMockTask('medium');
      const highPriority = createMockTask('high');
      const veryHighPriority = createMockTask('very-high');

      await queue.enqueue(lowPriority, { priority: 1 });
      await queue.enqueue(mediumPriority, { priority: 5 });
      await queue.enqueue(highPriority, { priority: 8 });

      // Queue is full, new task has priority 10
      await queue.enqueue(veryHighPriority, { priority: 10 });

      // Low priority task should be dropped
      expect(lowPriority.reject).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'BackpressureError',
          metadata: expect.objectContaining({
            strategy: BackpressureStrategy.SHED,
          }),
        })
      );

      // Queue should still have 3 tasks
      expect(queue.size).toBe(3);
    });

    it('should reject new task if it has lower priority than all queued tasks', async () => {
      const highPriority1 = createMockTask('high-1');
      const highPriority2 = createMockTask('high-2');
      const highPriority3 = createMockTask('high-3');
      const lowPriority = createMockTask('low');

      await queue.enqueue(highPriority1, { priority: 10 });
      await queue.enqueue(highPriority2, { priority: 9 });
      await queue.enqueue(highPriority3, { priority: 8 });

      // New task has lower priority
      await queue.enqueue(lowPriority, { priority: 5 });

      expect(lowPriority.reject).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'BackpressureError',
        })
      );

      // All high priority tasks should still be in queue
      expect(queue.size).toBe(3);
    });

    it('should emit shed event when task is dropped', async () => {
      const lowPriority = createMockTask('low');
      const mediumPriority = createMockTask('medium');
      const highPriority = createMockTask('high');
      const veryHighPriority = createMockTask('very-high');

      const shedHandler = vi.fn();
      queue.on('shed', shedHandler);

      await queue.enqueue(lowPriority, { priority: 1 });
      await queue.enqueue(mediumPriority, { priority: 5 });
      await queue.enqueue(highPriority, { priority: 8 });
      await queue.enqueue(veryHighPriority, { priority: 10 });

      expect(shedHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          droppedPriority: 1,
          newPriority: 10,
        })
      );
    });

    it('should handle tasks with same priority correctly', async () => {
      const task1 = createMockTask('task-1');
      const task2 = createMockTask('task-2');
      const task3 = createMockTask('task-3');
      const task4 = createMockTask('task-4');

      await queue.enqueue(task1, { priority: 5 });
      await queue.enqueue(task2, { priority: 5 });
      await queue.enqueue(task3, { priority: 5 });

      // New task with same priority should be rejected
      await queue.enqueue(task4, { priority: 5 });

      expect(task4.reject).toHaveBeenCalled();
    });
  });

  describe('drain events', () => {
    it('should emit drain event when queue drops below threshold', async () => {
      const queue = new BackpressureQueue({
        maxSize: 10,
        strategy: BackpressureStrategy.REJECT,
        drainThreshold: 0.5, // 50% = 5 tasks
      });

      const drainHandler = vi.fn();
      queue.on('drain', drainHandler);

      // Fill queue above threshold (6 > 5)
      for (let i = 0; i < 6; i++) {
        await queue.enqueue(createMockTask(`task-${i}`));
      }

      // Dequeue once to trigger drain event (6 -> 5)
      queue.dequeue();

      // Drain event fires when crossing threshold
      expect(drainHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          queueSize: 5, // At threshold
          maxSize: 10,
        })
      );
    });

    it('should not emit drain event if never above threshold', () => {
      const queue = new BackpressureQueue({
        maxSize: 10,
        strategy: BackpressureStrategy.REJECT,
        drainThreshold: 0.5,
      });

      const drainHandler = vi.fn();
      queue.on('drain', drainHandler);

      queue.dequeue(); // Dequeue from empty queue

      expect(drainHandler).not.toHaveBeenCalled();
    });

    it('should emit drain event only once per cycle', async () => {
      const queue = new BackpressureQueue({
        maxSize: 10,
        strategy: BackpressureStrategy.REJECT,
        drainThreshold: 0.2,
      });

      const drainHandler = vi.fn();
      queue.on('drain', drainHandler);

      // Fill queue above threshold
      for (let i = 0; i < 5; i++) {
        await queue.enqueue(createMockTask(`task-${i}`));
      }

      // Drain below threshold
      for (let i = 0; i < 4; i++) {
        queue.dequeue();
      }

      expect(drainHandler).toHaveBeenCalledTimes(1);

      // Dequeue one more time - should not emit again
      queue.dequeue();
      expect(drainHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe('task duration tracking', () => {
    let queue: BackpressureQueue;

    beforeEach(() => {
      queue = new BackpressureQueue({
        maxSize: 10,
        strategy: BackpressureStrategy.REJECT,
      });
    });

    it('should record task durations', () => {
      queue.recordTaskDuration(100);
      queue.recordTaskDuration(200);
      queue.recordTaskDuration(150);

      const stats = queue.getStats();

      expect(stats.avgTaskDuration).toBeCloseTo(150, 1);
    });

    it('should keep only last 100 durations', () => {
      // Record 150 durations
      for (let i = 0; i < 150; i++) {
        queue.recordTaskDuration(100);
      }

      // Add some different durations
      for (let i = 0; i < 10; i++) {
        queue.recordTaskDuration(500);
      }

      const stats = queue.getStats();

      // Average should be influenced by recent 500ms durations
      expect(stats.avgTaskDuration).toBeGreaterThan(100);
    });

    it('should estimate wait time based on durations', async () => {
      queue.recordTaskDuration(100);
      queue.recordTaskDuration(200);

      // Fill queue
      for (let i = 0; i < 5; i++) {
        await queue.enqueue(createMockTask(`task-${i}`));
      }

      const stats = queue.getStats();

      // Wait time should be avg (150ms) * queue size (5) = 750ms
      expect(stats.estimatedWaitTime).toBeCloseTo(750, 0);
    });

    it('should use default estimate when no durations recorded', async () => {
      // Fill queue without recording durations
      for (let i = 0; i < 5; i++) {
        await queue.enqueue(createMockTask(`task-${i}`));
      }

      const stats = queue.getStats();

      // Default: 100ms per task * 5 = 500ms
      expect(stats.estimatedWaitTime).toBe(500);
    });
  });

  describe('statistics', () => {
    let queue: BackpressureQueue;

    beforeEach(() => {
      queue = new BackpressureQueue({
        maxSize: 10,
        strategy: BackpressureStrategy.REJECT,
      });
    });

    it('should return accurate statistics', async () => {
      await queue.enqueue(createMockTask('task-1'));
      await queue.enqueue(createMockTask('task-2'));

      queue.recordTaskDuration(100);
      queue.recordTaskDuration(200);

      const stats = queue.getStats();

      expect(stats.size).toBe(2);
      expect(stats.maxSize).toBe(10);
      expect(stats.strategy).toBe(BackpressureStrategy.REJECT);
      expect(stats.avgTaskDuration).toBeCloseTo(150, 1);
      expect(stats.estimatedWaitTime).toBeGreaterThan(0);
    });

    it('should update statistics as queue changes', async () => {
      let stats = queue.getStats();
      expect(stats.size).toBe(0);

      await queue.enqueue(createMockTask('task-1'));
      stats = queue.getStats();
      expect(stats.size).toBe(1);

      queue.dequeue();
      stats = queue.getStats();
      expect(stats.size).toBe(0);
    });
  });

  describe('clear', () => {
    let queue: BackpressureQueue;

    beforeEach(() => {
      queue = new BackpressureQueue({
        maxSize: 10,
        strategy: BackpressureStrategy.REJECT,
      });
    });

    it('should clear all tasks without rejecting', async () => {
      const task1 = createMockTask('task-1');
      const task2 = createMockTask('task-2');

      await queue.enqueue(task1);
      await queue.enqueue(task2);

      queue.clear(false);

      expect(queue.size).toBe(0);
      expect(task1.reject).not.toHaveBeenCalled();
      expect(task2.reject).not.toHaveBeenCalled();
    });

    it('should clear and reject all pending tasks', async () => {
      const task1 = createMockTask('task-1');
      const task2 = createMockTask('task-2');

      await queue.enqueue(task1);
      await queue.enqueue(task2);

      queue.clear(true);

      expect(queue.size).toBe(0);
      expect(task1.reject).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'BackpressureError',
        })
      );
      expect(task2.reject).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'BackpressureError',
        })
      );
    });
  });

  describe('BackpressureError', () => {
    it('should include metadata', () => {
      const error = new BackpressureError('Test error', {
        queueSize: 10,
        maxSize: 10,
        suggestedRetryAfter: 500,
        strategy: BackpressureStrategy.REJECT,
      });

      expect(error.name).toBe('BackpressureError');
      expect(error.message).toBe('Test error');
      expect(error.metadata.queueSize).toBe(10);
      expect(error.metadata.maxSize).toBe(10);
      expect(error.metadata.suggestedRetryAfter).toBe(500);
      expect(error.metadata.strategy).toBe(BackpressureStrategy.REJECT);
    });

    it('should be instanceof Error', () => {
      const error = new BackpressureError('Test error', {
        queueSize: 0,
        maxSize: 10,
        suggestedRetryAfter: 0,
        strategy: BackpressureStrategy.REJECT,
      });

      expect(error instanceof Error).toBe(true);
      expect(error instanceof BackpressureError).toBe(true);
    });
  });
});
