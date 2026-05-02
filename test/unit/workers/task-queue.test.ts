/**
 * @file task-queue.test.ts
 * @description Unit tests for workers/task-queue module
 *
 * Tests priority-based task queue implementation including:
 * - Task enqueueing and dequeueing
 * - Priority-based scheduling
 * - Task timeout management
 * - Task completion and failure handling
 * - Queue statistics
 * - Worker scheduling
 *
 * @since 3.1.1
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TaskQueue } from '../../../src/workers/task-queue.js';
import {
  Task,
  WorkerMetadata,
  WorkerStatus,
  OperationType,
} from '../../../src/workers/worker-types.js';
import { TimeoutError } from '../../../src/errors.js';

describe('workers/task-queue', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let queue: TaskQueue;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.useFakeTimers();
    queue = new TaskQueue();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    vi.useRealTimers();
  });

  /**
   * Helper function to create a mock task.
   */
  function createMockTask(
    id: string,
    priority?: number,
    operation: OperationType = OperationType.MATRIX_MULTIPLY
  ): Task {
    return {
      id,
      operation,
      data: { matrixA: [[1, 2], [3, 4]] },
      resolve: vi.fn(),
      reject: vi.fn(),
      priority,
      createdAt: Date.now(),
    };
  }

  /**
   * Helper function to create a mock worker.
   */
  function createMockWorker(id: string, status: WorkerStatus = WorkerStatus.IDLE): WorkerMetadata {
    return {
      id,
      status,
      worker: {} as any, // Mock worker instance
      tasksCompleted: 0,
      tasksFailed: 0,
      lastActivity: Date.now(),
      createdAt: Date.now(),
    };
  }

  describe('constructor', () => {
    it('should create queue with default config', () => {
      const q = new TaskQueue();

      expect(q.size()).toBe(0);
      expect(q.activeCount()).toBe(0);
      expect(q.isEmpty()).toBe(true);
    });

    it('should create queue with custom config', () => {
      const q = new TaskQueue({ maxQueueSize: 500, taskTimeout: 10000 });

      expect(q.size()).toBe(0);
      expect(q.activeCount()).toBe(0);
    });

    it('should accept partial config', () => {
      const q = new TaskQueue({ maxQueueSize: 100 });

      expect(q).toBeDefined();
    });
  });

  describe('enqueue', () => {
    it('should enqueue task successfully', () => {
      const task = createMockTask('task-1');

      queue.enqueue(task);

      expect(queue.size()).toBe(1);
      expect(queue.isEmpty()).toBe(false);
    });

    it('should enqueue multiple tasks', () => {
      const task1 = createMockTask('task-1');
      const task2 = createMockTask('task-2');
      const task3 = createMockTask('task-3');

      queue.enqueue(task1);
      queue.enqueue(task2);
      queue.enqueue(task3);

      expect(queue.size()).toBe(3);
    });

    it('should order tasks by priority (higher first)', () => {
      const lowPriorityTask = createMockTask('low', 1);
      const highPriorityTask = createMockTask('high', 10);
      const mediumPriorityTask = createMockTask('medium', 5);

      queue.enqueue(lowPriorityTask);
      queue.enqueue(highPriorityTask);
      queue.enqueue(mediumPriorityTask);

      const first = queue.dequeue();
      const second = queue.dequeue();
      const third = queue.dequeue();

      expect(first?.id).toBe('high');
      expect(second?.id).toBe('medium');
      expect(third?.id).toBe('low');
    });

    it('should maintain FIFO order within same priority', () => {
      const task1 = createMockTask('task-1', 5);
      const task2 = createMockTask('task-2', 5);
      const task3 = createMockTask('task-3', 5);

      queue.enqueue(task1);
      queue.enqueue(task2);
      queue.enqueue(task3);

      expect(queue.dequeue()?.id).toBe('task-1');
      expect(queue.dequeue()?.id).toBe('task-2');
      expect(queue.dequeue()?.id).toBe('task-3');
    });

    it('should handle undefined priority as 0', () => {
      const noPriorityTask = createMockTask('no-priority');
      const lowPriorityTask = createMockTask('low', 1);

      queue.enqueue(lowPriorityTask);
      queue.enqueue(noPriorityTask);

      // Priority 1 should come before priority 0
      expect(queue.dequeue()?.id).toBe('low');
      expect(queue.dequeue()?.id).toBe('no-priority');
    });

    it('should reject task when queue is full', () => {
      const smallQueue = new TaskQueue({ maxQueueSize: 2 });
      const task1 = createMockTask('task-1');
      const task2 = createMockTask('task-2');
      const task3 = createMockTask('task-3');

      smallQueue.enqueue(task1);
      smallQueue.enqueue(task2);
      smallQueue.enqueue(task3); // Should be rejected

      expect(smallQueue.size()).toBe(2);
      expect(task3.reject).toHaveBeenCalled();
      expect(task3.reject).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should increment totalEnqueued stat', () => {
      const task = createMockTask('task-1');

      queue.enqueue(task);

      const stats = queue.getStats();
      expect(stats.totalEnqueued).toBe(1);
    });

    it('should increment totalFailed when rejecting full queue', () => {
      const smallQueue = new TaskQueue({ maxQueueSize: 1 });
      const task1 = createMockTask('task-1');
      const task2 = createMockTask('task-2');

      smallQueue.enqueue(task1);
      smallQueue.enqueue(task2);

      const stats = smallQueue.getStats();
      expect(stats.totalFailed).toBe(1);
    });
  });

  describe('dequeue', () => {
    it('should dequeue task in priority order', () => {
      const task1 = createMockTask('task-1', 5);
      const task2 = createMockTask('task-2', 10);

      queue.enqueue(task1);
      queue.enqueue(task2);

      const dequeued = queue.dequeue();
      expect(dequeued?.id).toBe('task-2'); // Higher priority
    });

    it('should return null when queue is empty', () => {
      const task = queue.dequeue();

      expect(task).toBeNull();
    });

    it('should decrease queue size', () => {
      const task = createMockTask('task-1');

      queue.enqueue(task);
      expect(queue.size()).toBe(1);

      queue.dequeue();
      expect(queue.size()).toBe(0);
    });

    it('should remove task from queue', () => {
      const task = createMockTask('task-1');

      queue.enqueue(task);
      const dequeued = queue.dequeue();

      expect(dequeued).toBe(task);
      expect(queue.size()).toBe(0);
    });
  });

  describe('assignTask', () => {
    it('should assign task to worker', () => {
      const task = createMockTask('task-1');
      const worker = createMockWorker('worker-1');

      queue.assignTask(task, worker);

      expect(queue.activeCount()).toBe(1);
    });

    it('should set up task timeout', () => {
      const task = createMockTask('task-1');
      const worker = createMockWorker('worker-1');

      queue.assignTask(task, worker);

      // Advance time to trigger timeout
      vi.advanceTimersByTime(30000);

      expect(task.reject).toHaveBeenCalled();
    });

    it('should track multiple active tasks', () => {
      const task1 = createMockTask('task-1');
      const task2 = createMockTask('task-2');
      const worker1 = createMockWorker('worker-1');
      const worker2 = createMockWorker('worker-2');

      queue.assignTask(task1, worker1);
      queue.assignTask(task2, worker2);

      expect(queue.activeCount()).toBe(2);
    });
  });

  describe('completeTask', () => {
    it('should complete task successfully', () => {
      const task = createMockTask('task-1');
      const worker = createMockWorker('worker-1');
      const result = [[5, 6], [7, 8]];

      queue.assignTask(task, worker);
      queue.completeTask('task-1', result);

      expect(task.resolve).toHaveBeenCalledWith(result);
      expect(queue.activeCount()).toBe(0);
    });

    it('should clear timeout on completion', () => {
      const task = createMockTask('task-1');
      const worker = createMockWorker('worker-1');

      queue.assignTask(task, worker);
      queue.completeTask('task-1', {});

      // Advance time - timeout should not fire
      vi.advanceTimersByTime(30000);

      expect(task.reject).not.toHaveBeenCalled();
    });

    it('should increment totalCompleted stat', () => {
      const task = createMockTask('task-1');
      const worker = createMockWorker('worker-1');

      queue.assignTask(task, worker);
      queue.completeTask('task-1', {});

      const stats = queue.getStats();
      expect(stats.totalCompleted).toBe(1);
    });

    it('should handle completing unknown task', () => {
      queue.completeTask('unknown-task', {});

      // Should not throw
      expect(queue.activeCount()).toBe(0);
    });

    it('should remove task from active tasks', () => {
      const task = createMockTask('task-1');
      const worker = createMockWorker('worker-1');

      queue.assignTask(task, worker);
      expect(queue.activeCount()).toBe(1);

      queue.completeTask('task-1', {});
      expect(queue.activeCount()).toBe(0);
    });
  });

  describe('failTask', () => {
    it('should fail task with error', () => {
      const task = createMockTask('task-1');
      const worker = createMockWorker('worker-1');
      const error = new Error('Task failed');

      queue.assignTask(task, worker);
      queue.failTask('task-1', error);

      expect(task.reject).toHaveBeenCalledWith(error);
      expect(queue.activeCount()).toBe(0);
    });

    it('should clear timeout on failure', () => {
      const task = createMockTask('task-1');
      const worker = createMockWorker('worker-1');
      const error = new Error('Task failed');

      queue.assignTask(task, worker);
      queue.failTask('task-1', error);

      // Advance time - timeout should not fire
      vi.advanceTimersByTime(30000);

      // Only called once (from failTask)
      expect(task.reject).toHaveBeenCalledTimes(1);
    });

    it('should increment totalFailed stat', () => {
      const task = createMockTask('task-1');
      const worker = createMockWorker('worker-1');
      const error = new Error('Task failed');

      queue.assignTask(task, worker);
      queue.failTask('task-1', error);

      const stats = queue.getStats();
      expect(stats.totalFailed).toBe(1);
    });

    it('should handle failing unknown task', () => {
      const error = new Error('Task failed');

      queue.failTask('unknown-task', error);

      // Should not throw
      expect(queue.activeCount()).toBe(0);
    });
  });

  describe('handleTaskTimeout', () => {
    it('should timeout task after configured duration', () => {
      const task = createMockTask('task-1');
      const worker = createMockWorker('worker-1');

      queue.assignTask(task, worker);

      vi.advanceTimersByTime(30000);

      expect(task.reject).toHaveBeenCalled();
      expect(task.reject).toHaveBeenCalledWith(expect.any(TimeoutError));
    });

    it('should set worker to ERROR status on timeout', () => {
      const task = createMockTask('task-1');
      const worker = createMockWorker('worker-1', WorkerStatus.BUSY);

      queue.assignTask(task, worker);

      vi.advanceTimersByTime(30000);

      expect(worker.status).toBe(WorkerStatus.ERROR);
    });

    it('should increment totalTimedOut stat', () => {
      const task = createMockTask('task-1');
      const worker = createMockWorker('worker-1');

      queue.assignTask(task, worker);

      vi.advanceTimersByTime(30000);

      const stats = queue.getStats();
      expect(stats.totalTimedOut).toBe(1);
      expect(stats.totalFailed).toBe(1); // Also counted as failed
    });

    it('should use custom timeout from config', () => {
      const customQueue = new TaskQueue({ taskTimeout: 5000 });
      const task = createMockTask('task-1');
      const worker = createMockWorker('worker-1');

      customQueue.assignTask(task, worker);

      // Should not timeout before 5000ms
      vi.advanceTimersByTime(4999);
      expect(task.reject).not.toHaveBeenCalled();

      // Should timeout at 5000ms
      vi.advanceTimersByTime(1);
      expect(task.reject).toHaveBeenCalled();
    });

    it('should remove task from active tasks on timeout', () => {
      const task = createMockTask('task-1');
      const worker = createMockWorker('worker-1');

      queue.assignTask(task, worker);
      expect(queue.activeCount()).toBe(1);

      vi.advanceTimersByTime(30000);

      expect(queue.activeCount()).toBe(0);
    });
  });

  describe('scheduleNext', () => {
    it('should schedule task to idle worker', () => {
      const task = createMockTask('task-1');
      const worker = createMockWorker('worker-1', WorkerStatus.IDLE);

      queue.enqueue(task);
      const scheduled = queue.scheduleNext([worker]);

      expect(scheduled).toBe(true);
      expect(worker.status).toBe(WorkerStatus.BUSY);
      expect(worker.currentTaskId).toBe('task-1');
      expect(queue.size()).toBe(0);
      expect(queue.activeCount()).toBe(1);
    });

    it('should return false when no idle workers', () => {
      const task = createMockTask('task-1');
      const worker = createMockWorker('worker-1', WorkerStatus.BUSY);

      queue.enqueue(task);
      const scheduled = queue.scheduleNext([worker]);

      expect(scheduled).toBe(false);
      expect(queue.size()).toBe(1);
    });

    it('should return false when no pending tasks', () => {
      const worker = createMockWorker('worker-1', WorkerStatus.IDLE);

      const scheduled = queue.scheduleNext([worker]);

      expect(scheduled).toBe(false);
    });

    it('should schedule highest priority task', () => {
      const lowPriorityTask = createMockTask('low', 1);
      const highPriorityTask = createMockTask('high', 10);
      const worker = createMockWorker('worker-1', WorkerStatus.IDLE);

      queue.enqueue(lowPriorityTask);
      queue.enqueue(highPriorityTask);

      queue.scheduleNext([worker]);

      expect(worker.currentTaskId).toBe('high');
    });

    it('should select first idle worker from multiple', () => {
      const task = createMockTask('task-1');
      const worker1 = createMockWorker('worker-1', WorkerStatus.IDLE);
      const worker2 = createMockWorker('worker-2', WorkerStatus.IDLE);
      const worker3 = createMockWorker('worker-3', WorkerStatus.BUSY);

      queue.enqueue(task);
      queue.scheduleNext([worker3, worker2, worker1]);

      expect(worker2.currentTaskId).toBe('task-1');
      expect(worker1.currentTaskId).toBeUndefined();
    });
  });

  describe('cancelAll', () => {
    it('should cancel all pending tasks', () => {
      const task1 = createMockTask('task-1');
      const task2 = createMockTask('task-2');
      const task3 = createMockTask('task-3');

      queue.enqueue(task1);
      queue.enqueue(task2);
      queue.enqueue(task3);

      queue.cancelAll('Test cancellation');

      expect(task1.reject).toHaveBeenCalled();
      expect(task2.reject).toHaveBeenCalled();
      expect(task3.reject).toHaveBeenCalled();
      expect(queue.size()).toBe(0);
    });

    it('should cancel all active tasks', () => {
      const task1 = createMockTask('task-1');
      const task2 = createMockTask('task-2');
      const worker1 = createMockWorker('worker-1');
      const worker2 = createMockWorker('worker-2');

      queue.assignTask(task1, worker1);
      queue.assignTask(task2, worker2);

      queue.cancelAll('Test cancellation');

      expect(task1.reject).toHaveBeenCalled();
      expect(task2.reject).toHaveBeenCalled();
      expect(queue.activeCount()).toBe(0);
    });

    it('should cancel both pending and active tasks', () => {
      const pendingTask = createMockTask('pending');
      const activeTask = createMockTask('active');
      const worker = createMockWorker('worker-1');

      queue.enqueue(pendingTask);
      queue.assignTask(activeTask, worker);

      queue.cancelAll('Test cancellation');

      expect(pendingTask.reject).toHaveBeenCalled();
      expect(activeTask.reject).toHaveBeenCalled();
      expect(queue.size()).toBe(0);
      expect(queue.activeCount()).toBe(0);
      expect(queue.isEmpty()).toBe(true);
    });

    it('should clear task timeouts', () => {
      const task = createMockTask('task-1');
      const worker = createMockWorker('worker-1');

      queue.assignTask(task, worker);
      queue.cancelAll('Test cancellation');

      // Advance time - timeout should not fire
      vi.advanceTimersByTime(30000);

      // Only called once (from cancelAll)
      expect(task.reject).toHaveBeenCalledTimes(1);
    });

    it('should include reason in error message', () => {
      const task = createMockTask('task-1');

      queue.enqueue(task);
      queue.cancelAll('Shutdown');

      expect(task.reject).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Shutdown'),
        })
      );
    });
  });

  describe('size', () => {
    it('should return 0 for empty queue', () => {
      expect(queue.size()).toBe(0);
    });

    it('should return correct pending task count', () => {
      queue.enqueue(createMockTask('task-1'));
      queue.enqueue(createMockTask('task-2'));
      queue.enqueue(createMockTask('task-3'));

      expect(queue.size()).toBe(3);
    });

    it('should not include active tasks in size', () => {
      const task = createMockTask('task-1');
      const worker = createMockWorker('worker-1');

      queue.enqueue(task);
      queue.assignTask(queue.dequeue()!, worker);

      expect(queue.size()).toBe(0);
    });
  });

  describe('activeCount', () => {
    it('should return 0 when no active tasks', () => {
      expect(queue.activeCount()).toBe(0);
    });

    it('should return correct active task count', () => {
      const task1 = createMockTask('task-1');
      const task2 = createMockTask('task-2');
      const worker1 = createMockWorker('worker-1');
      const worker2 = createMockWorker('worker-2');

      queue.assignTask(task1, worker1);
      queue.assignTask(task2, worker2);

      expect(queue.activeCount()).toBe(2);
    });

    it('should not include pending tasks in activeCount', () => {
      queue.enqueue(createMockTask('task-1'));
      queue.enqueue(createMockTask('task-2'));

      expect(queue.activeCount()).toBe(0);
    });
  });

  describe('isEmpty', () => {
    it('should return true for empty queue', () => {
      expect(queue.isEmpty()).toBe(true);
    });

    it('should return false when pending tasks exist', () => {
      queue.enqueue(createMockTask('task-1'));

      expect(queue.isEmpty()).toBe(false);
    });

    it('should return false when active tasks exist', () => {
      const task = createMockTask('task-1');
      const worker = createMockWorker('worker-1');

      queue.assignTask(task, worker);

      expect(queue.isEmpty()).toBe(false);
    });

    it('should return true when all tasks completed', () => {
      const task = createMockTask('task-1');
      const worker = createMockWorker('worker-1');

      queue.enqueue(task);
      queue.assignTask(queue.dequeue()!, worker);
      queue.completeTask('task-1', {});

      expect(queue.isEmpty()).toBe(true);
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', () => {
      const task1 = createMockTask('task-1');
      const task2 = createMockTask('task-2');
      const task3 = createMockTask('task-3');
      const worker = createMockWorker('worker-1');

      queue.enqueue(task1);
      queue.enqueue(task2);
      queue.enqueue(task3);

      queue.assignTask(queue.dequeue()!, worker);
      queue.completeTask('task-1', {});

      queue.assignTask(queue.dequeue()!, worker);
      queue.failTask('task-2', new Error('Test'));

      const stats = queue.getStats();

      expect(stats.pending).toBe(1);
      expect(stats.active).toBe(0);
      expect(stats.totalEnqueued).toBe(3);
      expect(stats.totalCompleted).toBe(1);
      expect(stats.totalFailed).toBe(1);
    });

    it('should calculate success rate correctly', () => {
      const task1 = createMockTask('task-1');
      const task2 = createMockTask('task-2');
      const task3 = createMockTask('task-3');
      const worker = createMockWorker('worker-1');

      queue.assignTask(task1, worker);
      queue.completeTask('task-1', {});

      queue.assignTask(task2, worker);
      queue.completeTask('task-2', {});

      queue.assignTask(task3, worker);
      queue.failTask('task-3', new Error('Test'));

      const stats = queue.getStats();

      expect(stats.successRate).toBe('66.7%'); // 2/3 = 66.7%
    });

    it('should return 0% success rate when no tasks', () => {
      const stats = queue.getStats();

      expect(stats.successRate).toBe('0.0%');
    });

    it('should track timeouts separately', () => {
      const task = createMockTask('task-1');
      const worker = createMockWorker('worker-1');

      queue.assignTask(task, worker);
      vi.advanceTimersByTime(30000);

      const stats = queue.getStats();

      expect(stats.totalTimedOut).toBe(1);
      expect(stats.totalFailed).toBe(1);
    });

    it('should report avgExecutionTimeMs close to actual duration', () => {
      // Bug-fix regression: prior code used `createdAt / totalCompleted`
      // (epoch-millis ÷ count), which silently over-reports by ~10^12.
      // This test asserts the metric is the *mean of completed task durations*.
      const worker = createMockWorker('worker-1');

      const task1 = createMockTask('task-1');
      queue.assignTask(task1, worker);
      vi.advanceTimersByTime(100);
      queue.completeTask('task-1', {});

      const task2 = createMockTask('task-2');
      queue.assignTask(task2, worker);
      vi.advanceTimersByTime(200);
      queue.completeTask('task-2', {});

      const task3 = createMockTask('task-3');
      queue.assignTask(task3, worker);
      vi.advanceTimersByTime(300);
      queue.completeTask('task-3', {});

      const stats = queue.getStats();
      expect(stats.totalCompleted).toBe(3);
      // Mean of [100, 200, 300] = 200ms
      expect(stats.avgExecutionTimeMs).toBeCloseTo(200, 0);
    });

    it('should report avgExecutionTimeMs as 0 when no tasks completed', () => {
      const stats = queue.getStats();
      expect(stats.avgExecutionTimeMs).toBe(0);
    });
  });

  describe('resetStats', () => {
    it('should reset all statistics', () => {
      const task = createMockTask('task-1');
      const worker = createMockWorker('worker-1');

      queue.enqueue(task);
      queue.assignTask(queue.dequeue()!, worker);
      queue.completeTask('task-1', {});

      queue.resetStats();

      const stats = queue.getStats();
      expect(stats.totalEnqueued).toBe(0);
      expect(stats.totalCompleted).toBe(0);
      expect(stats.totalFailed).toBe(0);
      expect(stats.totalTimedOut).toBe(0);
    });

    it('should not affect current queue state', () => {
      queue.enqueue(createMockTask('task-1'));
      queue.enqueue(createMockTask('task-2'));

      queue.resetStats();

      expect(queue.size()).toBe(2);
    });
  });

  describe('getTaskInfo', () => {
    it('should return pending task info', () => {
      const task = createMockTask('task-1', 5);

      queue.enqueue(task);

      const info = queue.getTaskInfo('task-1');

      expect(info?.status).toBe('pending');
      expect(info?.task).toBe(task);
    });

    it('should return active task info', () => {
      const task = createMockTask('task-1');
      const worker = createMockWorker('worker-1');

      queue.assignTask(task, worker);

      const info = queue.getTaskInfo('task-1');

      expect(info?.status).toBe('active');
      expect(info?.task).toBe(task);
      expect(info?.worker).toBe(worker);
      expect(info?.startTime).toBeDefined();
      expect(info?.elapsedTime).toBeDefined();
    });

    it('should return not_found for unknown task', () => {
      const info = queue.getTaskInfo('unknown-task');

      expect(info?.status).toBe('not_found');
      expect(info?.task).toBeUndefined();
    });

    it('should calculate elapsed time for active tasks', () => {
      const task = createMockTask('task-1');
      const worker = createMockWorker('worker-1');

      queue.assignTask(task, worker);

      vi.advanceTimersByTime(1000);

      const info = queue.getTaskInfo('task-1');

      expect(info?.elapsedTime).toBeGreaterThanOrEqual(1000);
    });

    it('should not find completed tasks', () => {
      const task = createMockTask('task-1');
      const worker = createMockWorker('worker-1');

      queue.assignTask(task, worker);
      queue.completeTask('task-1', {});

      const info = queue.getTaskInfo('task-1');

      expect(info?.status).toBe('not_found');
    });
  });
});
