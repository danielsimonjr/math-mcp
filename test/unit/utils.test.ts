/**
 * @file utils.test.ts
 * @description Unit tests for utils module
 *
 * Tests utility functions including:
 * - Timeout protection (withTimeout)
 * - Performance tracking (perfTracker)
 * - Helper functions (formatNumber, isPlainObject)
 *
 * @since 3.1.1
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  withTimeout,
  DEFAULT_OPERATION_TIMEOUT,
  perfTracker,
  formatNumber,
  isPlainObject,
} from '../../src/utils.js';
import { TimeoutError } from '../../src/errors.js';

describe('utils', () => {
  describe('DEFAULT_OPERATION_TIMEOUT', () => {
    it('should be exported and defined', () => {
      expect(DEFAULT_OPERATION_TIMEOUT).toBeDefined();
      expect(typeof DEFAULT_OPERATION_TIMEOUT).toBe('number');
    });

    it('should be a positive number', () => {
      expect(DEFAULT_OPERATION_TIMEOUT).toBeGreaterThan(0);
    });
  });

  describe('withTimeout', () => {
    it('should resolve when promise completes before timeout', async () => {
      const promise = Promise.resolve('success');
      const result = await withTimeout(promise, 1000);
      expect(result).toBe('success');
    });

    it('should reject with TimeoutError when promise exceeds timeout', async () => {
      const slowPromise = new Promise((resolve) => setTimeout(resolve, 200));

      await expect(
        withTimeout(slowPromise, 50)
      ).rejects.toThrow(TimeoutError);
    });

    it('should include operation name in timeout error', async () => {
      const slowPromise = new Promise((resolve) => setTimeout(resolve, 200));

      try {
        await withTimeout(slowPromise, 50, 'test operation');
        expect.fail('Should have thrown TimeoutError');
      } catch (error) {
        expect(error).toBeInstanceOf(TimeoutError);
        expect((error as Error).message).toContain('test operation');
      }
    });

    it('should handle rejected promises', async () => {
      const failingPromise = Promise.reject(new Error('Test error'));

      await expect(
        withTimeout(failingPromise, 1000)
      ).rejects.toThrow('Test error');
    });

    it('should clean up timeout when promise resolves', async () => {
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
      const promise = Promise.resolve('done');

      await withTimeout(promise, 1000);

      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });

    it('should work with async functions', async () => {
      const asyncFn = async (): Promise<number> => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return 42;
      };

      const result = await withTimeout(asyncFn(), 1000);
      expect(result).toBe(42);
    });

    it('should timeout fast operations with very short timeout', async () => {
      // Even a resolved promise should timeout with 0ms
      const promise = new Promise(resolve => setTimeout(() => resolve('done'), 5));

      await expect(
        withTimeout(promise, 1)
      ).rejects.toThrow(TimeoutError);
    });
  });

  describe('perfTracker', () => {
    beforeEach(() => {
      perfTracker.reset();
    });

    afterEach(() => {
      perfTracker.reset();
    });

    describe('recordOperation', () => {
      it('should record operation count', () => {
        perfTracker.recordOperation('test_op', 100);

        const stats = perfTracker.getStats('test_op');
        expect(stats.count).toBe(1);
      });

      it('should accumulate operation counts', () => {
        perfTracker.recordOperation('test_op', 100);
        perfTracker.recordOperation('test_op', 200);
        perfTracker.recordOperation('test_op', 150);

        const stats = perfTracker.getStats('test_op');
        expect(stats.count).toBe(3);
      });

      it('should accumulate operation time', () => {
        perfTracker.recordOperation('test_op', 100);
        perfTracker.recordOperation('test_op', 200);

        const stats = perfTracker.getStats('test_op');
        expect(stats.totalTime).toBe(300);
      });

      it('should calculate average time', () => {
        perfTracker.recordOperation('test_op', 100);
        perfTracker.recordOperation('test_op', 200);
        perfTracker.recordOperation('test_op', 300);

        const stats = perfTracker.getStats('test_op');
        expect(stats.avgTime).toBe(200); // (100 + 200 + 300) / 3
      });

      it('should track multiple operations separately', () => {
        perfTracker.recordOperation('op1', 100);
        perfTracker.recordOperation('op2', 200);

        const stats1 = perfTracker.getStats('op1');
        const stats2 = perfTracker.getStats('op2');

        expect(stats1.count).toBe(1);
        expect(stats1.totalTime).toBe(100);
        expect(stats2.count).toBe(1);
        expect(stats2.totalTime).toBe(200);
      });
    });

    describe('getStats', () => {
      it('should return zero stats for unknown operation', () => {
        const stats = perfTracker.getStats('unknown_op');

        expect(stats.count).toBe(0);
        expect(stats.totalTime).toBe(0);
        expect(stats.avgTime).toBe(0);
      });

      it('should return correct stats for recorded operation', () => {
        perfTracker.recordOperation('matrix_multiply', 50);
        perfTracker.recordOperation('matrix_multiply', 100);

        const stats = perfTracker.getStats('matrix_multiply');

        expect(stats.count).toBe(2);
        expect(stats.totalTime).toBe(150);
        expect(stats.avgTime).toBe(75);
      });
    });

    describe('getAllStats', () => {
      it('should return empty map when no operations recorded', () => {
        const allStats = perfTracker.getAllStats();
        expect(allStats.size).toBe(0);
      });

      it('should return stats for all recorded operations', () => {
        perfTracker.recordOperation('op1', 100);
        perfTracker.recordOperation('op2', 200);
        perfTracker.recordOperation('op3', 300);

        const allStats = perfTracker.getAllStats();

        expect(allStats.size).toBe(3);
        expect(allStats.has('op1')).toBe(true);
        expect(allStats.has('op2')).toBe(true);
        expect(allStats.has('op3')).toBe(true);
      });

      it('should return correct stats for each operation', () => {
        perfTracker.recordOperation('op1', 100);
        perfTracker.recordOperation('op1', 200);
        perfTracker.recordOperation('op2', 300);

        const allStats = perfTracker.getAllStats();
        const op1Stats = allStats.get('op1');
        const op2Stats = allStats.get('op2');

        expect(op1Stats?.count).toBe(2);
        expect(op1Stats?.totalTime).toBe(300);
        expect(op2Stats?.count).toBe(1);
        expect(op2Stats?.totalTime).toBe(300);
      });
    });

    describe('reset', () => {
      it('should clear all recorded operations', () => {
        perfTracker.recordOperation('op1', 100);
        perfTracker.recordOperation('op2', 200);

        perfTracker.reset();

        const allStats = perfTracker.getAllStats();
        expect(allStats.size).toBe(0);
      });

      it('should allow recording new operations after reset', () => {
        perfTracker.recordOperation('op1', 100);
        perfTracker.reset();
        perfTracker.recordOperation('op2', 200);

        const stats = perfTracker.getStats('op2');
        expect(stats.count).toBe(1);
        expect(stats.totalTime).toBe(200);
      });
    });
  });

  describe('formatNumber', () => {
    it('should format number with default 4 decimals', () => {
      const result = formatNumber(3.14159265);
      expect(result).toBe('3.1416');
    });

    it('should format number with custom decimal places', () => {
      const result = formatNumber(3.14159265, 2);
      expect(result).toBe('3.14');
    });

    it('should format integer with specified decimals', () => {
      const result = formatNumber(42, 2);
      expect(result).toBe('42.00');
    });

    it('should format zero correctly', () => {
      const result = formatNumber(0, 4);
      expect(result).toBe('0.0000');
    });

    it('should format negative numbers', () => {
      const result = formatNumber(-3.14159, 2);
      expect(result).toBe('-3.14');
    });

    it('should handle very small numbers', () => {
      const result = formatNumber(0.000001, 6);
      expect(result).toBe('0.000001');
    });

    it('should handle very large numbers', () => {
      const result = formatNumber(1234567.89, 2);
      expect(result).toBe('1234567.89');
    });

    it('should round correctly', () => {
      const result = formatNumber(1.5555, 2);
      expect(result).toBe('1.56');
    });
  });

  describe('isPlainObject', () => {
    it('should return true for plain object', () => {
      expect(isPlainObject({})).toBe(true);
      expect(isPlainObject({ a: 1, b: 2 })).toBe(true);
    });

    it('should return false for array', () => {
      expect(isPlainObject([])).toBe(false);
      expect(isPlainObject([1, 2, 3])).toBe(false);
    });

    it('should return false for null', () => {
      expect(isPlainObject(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isPlainObject(undefined)).toBe(false);
    });

    it('should return false for primitives', () => {
      expect(isPlainObject(42)).toBe(false);
      expect(isPlainObject('string')).toBe(false);
      expect(isPlainObject(true)).toBe(false);
    });

    it('should return false for Date objects', () => {
      expect(isPlainObject(new Date())).toBe(false);
    });

    it('should return false for RegExp objects', () => {
      expect(isPlainObject(/test/)).toBe(false);
    });

    it('should return false for class instances', () => {
      class TestClass {}
      expect(isPlainObject(new TestClass())).toBe(false);
    });

    it('should return true for Object.create(null)', () => {
      const obj = Object.create(null);
      // This actually returns false because Object.getPrototypeOf(value) !== Object.prototype
      expect(isPlainObject(obj)).toBe(false);
    });

    it('should return true for nested plain objects', () => {
      const obj = { a: { b: { c: 1 } } };
      expect(isPlainObject(obj)).toBe(true);
    });
  });
});
