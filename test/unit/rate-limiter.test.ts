/**
 * @file rate-limiter.test.ts
 * @description Unit tests for rate-limiter module
 *
 * Tests rate limiting and throttling functionality including:
 * - Token bucket rate limiting
 * - Concurrent request limits
 * - Queue size limits
 * - Request lifecycle tracking
 * - Rate limit statistics
 *
 * @since 3.1.1
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  RateLimiter,
  RateLimiterConfig,
  withRateLimit,
  globalRateLimiter,
} from '../../src/rate-limiter.js';
import { RateLimitError } from '../../src/errors.js';

describe('rate-limiter', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  describe('RateLimiter', () => {
    describe('constructor', () => {
      it('should create limiter with default config', () => {
        const limiter = new RateLimiter();
        const stats = limiter.getStats();

        expect(stats.maxConcurrent).toBe(10);
        expect(stats.maxQueued).toBe(50);
        expect(stats.maxTokens).toBe(100);
      });

      it('should create limiter with custom config', () => {
        const limiter = new RateLimiter({
          maxRequestsPerWindow: 50,
          windowMs: 30000,
          maxConcurrent: 5,
          maxQueueSize: 25,
        });

        const stats = limiter.getStats();

        expect(stats.maxConcurrent).toBe(5);
        expect(stats.maxQueued).toBe(25);
        expect(stats.maxTokens).toBe(50);
      });

      it('should accept partial config', () => {
        const limiter = new RateLimiter({
          maxConcurrent: 20,
        });

        const stats = limiter.getStats();

        expect(stats.maxConcurrent).toBe(20);
        expect(stats.maxQueued).toBe(50); // Default
        expect(stats.maxTokens).toBe(100); // Default
      });

      it('should initialize with zero concurrent requests', () => {
        const limiter = new RateLimiter();
        const stats = limiter.getStats();

        expect(stats.concurrent).toBe(0);
        expect(stats.queued).toBe(0);
      });

      it('should initialize token bucket at full capacity', () => {
        const limiter = new RateLimiter({ maxRequestsPerWindow: 10 });
        const stats = limiter.getStats();

        expect(stats.availableTokens).toBe(10);
      });
    });

    describe('allowRequest', () => {
      it('should allow request when under limits', () => {
        const limiter = new RateLimiter();

        const allowed = limiter.allowRequest();

        expect(allowed).toBe(true);
      });

      it('should consume token on allowed request', () => {
        const limiter = new RateLimiter({ maxRequestsPerWindow: 5 });

        limiter.allowRequest();

        const stats = limiter.getStats();
        expect(stats.availableTokens).toBe(4);
      });

      it('should allow multiple requests up to token limit', () => {
        const limiter = new RateLimiter({ maxRequestsPerWindow: 3 });

        expect(limiter.allowRequest()).toBe(true);
        expect(limiter.allowRequest()).toBe(true);
        expect(limiter.allowRequest()).toBe(true);
      });

      it('should reject request when token bucket is empty', () => {
        const limiter = new RateLimiter({ maxRequestsPerWindow: 2 });

        limiter.allowRequest(); // Token 1
        limiter.allowRequest(); // Token 2
        const allowed = limiter.allowRequest(); // No tokens left

        expect(allowed).toBe(false);
      });

      it('should reject request when concurrent limit reached', () => {
        const limiter = new RateLimiter({ maxConcurrent: 2 });

        limiter.allowRequest();
        limiter.startRequest();
        limiter.allowRequest();
        limiter.startRequest();

        // Concurrent limit reached
        const allowed = limiter.allowRequest();

        expect(allowed).toBe(false);
      });

      it('should check concurrent limit before token bucket', () => {
        const limiter = new RateLimiter({
          maxConcurrent: 1,
          maxRequestsPerWindow: 10,
        });

        limiter.allowRequest();
        limiter.startRequest();

        const allowed = limiter.allowRequest();

        expect(allowed).toBe(false);
        // Tokens not consumed because concurrent limit hit first
        const stats = limiter.getStats();
        expect(stats.availableTokens).toBe(9); // Only one consumed
      });
    });

    describe('allowQueue', () => {
      it('should allow queueing when under limit', () => {
        const limiter = new RateLimiter();

        const allowed = limiter.allowQueue();

        expect(allowed).toBe(true);
      });

      it('should reject queueing when queue is full', () => {
        const limiter = new RateLimiter({ maxQueueSize: 2 });

        limiter.queueRequest();
        limiter.queueRequest();

        const allowed = limiter.allowQueue();

        expect(allowed).toBe(false);
      });

      it('should allow queue after dequeue', () => {
        const limiter = new RateLimiter({ maxQueueSize: 2 });

        limiter.queueRequest();
        limiter.queueRequest();
        limiter.dequeueRequest();

        const allowed = limiter.allowQueue();

        expect(allowed).toBe(true);
      });
    });

    describe('startRequest', () => {
      it('should increment concurrent request count', () => {
        const limiter = new RateLimiter();

        limiter.startRequest();

        const stats = limiter.getStats();
        expect(stats.concurrent).toBe(1);
      });

      it('should track multiple concurrent requests', () => {
        const limiter = new RateLimiter();

        limiter.startRequest();
        limiter.startRequest();
        limiter.startRequest();

        const stats = limiter.getStats();
        expect(stats.concurrent).toBe(3);
      });
    });

    describe('endRequest', () => {
      it('should decrement concurrent request count', () => {
        const limiter = new RateLimiter();

        limiter.startRequest();
        limiter.endRequest();

        const stats = limiter.getStats();
        expect(stats.concurrent).toBe(0);
      });

      it('should not go below zero', () => {
        const limiter = new RateLimiter();

        limiter.endRequest();
        limiter.endRequest();

        const stats = limiter.getStats();
        expect(stats.concurrent).toBe(0);
      });

      it('should handle multiple start/end cycles', () => {
        const limiter = new RateLimiter();

        limiter.startRequest();
        limiter.startRequest();
        limiter.endRequest();
        limiter.startRequest();
        limiter.endRequest();

        const stats = limiter.getStats();
        expect(stats.concurrent).toBe(1);
      });
    });

    describe('queueRequest', () => {
      it('should increment queued request count', () => {
        const limiter = new RateLimiter();

        limiter.queueRequest();

        const stats = limiter.getStats();
        expect(stats.queued).toBe(1);
      });

      it('should track multiple queued requests', () => {
        const limiter = new RateLimiter();

        limiter.queueRequest();
        limiter.queueRequest();
        limiter.queueRequest();

        const stats = limiter.getStats();
        expect(stats.queued).toBe(3);
      });
    });

    describe('dequeueRequest', () => {
      it('should decrement queued request count', () => {
        const limiter = new RateLimiter();

        limiter.queueRequest();
        limiter.dequeueRequest();

        const stats = limiter.getStats();
        expect(stats.queued).toBe(0);
      });

      it('should not go below zero', () => {
        const limiter = new RateLimiter();

        limiter.dequeueRequest();
        limiter.dequeueRequest();

        const stats = limiter.getStats();
        expect(stats.queued).toBe(0);
      });

      it('should handle multiple queue/dequeue cycles', () => {
        const limiter = new RateLimiter();

        limiter.queueRequest();
        limiter.queueRequest();
        limiter.dequeueRequest();
        limiter.queueRequest();
        limiter.dequeueRequest();

        const stats = limiter.getStats();
        expect(stats.queued).toBe(1);
      });
    });

    describe('getStats', () => {
      it('should return accurate statistics', () => {
        const limiter = new RateLimiter({
          maxRequestsPerWindow: 50,
          maxConcurrent: 5,
          maxQueueSize: 10,
        });

        limiter.startRequest();
        limiter.startRequest();
        limiter.queueRequest();
        limiter.allowRequest();

        const stats = limiter.getStats();

        expect(stats.concurrent).toBe(2);
        expect(stats.queued).toBe(1);
        expect(stats.availableTokens).toBe(49); // 50 - 1
        expect(stats.maxConcurrent).toBe(5);
        expect(stats.maxQueued).toBe(10);
        expect(stats.maxTokens).toBe(50);
      });

      it('should floor available tokens', () => {
        const limiter = new RateLimiter({ maxRequestsPerWindow: 10 });

        limiter.allowRequest();

        const stats = limiter.getStats();

        // Should be an integer (floored)
        expect(Number.isInteger(stats.availableTokens)).toBe(true);
      });
    });

    describe('reset', () => {
      it('should reset all counters', () => {
        const limiter = new RateLimiter();

        limiter.startRequest();
        limiter.startRequest();
        limiter.queueRequest();
        limiter.allowRequest();

        limiter.reset();

        const stats = limiter.getStats();

        expect(stats.concurrent).toBe(0);
        expect(stats.queued).toBe(0);
        expect(stats.availableTokens).toBe(stats.maxTokens);
      });

      it('should allow requests after reset', () => {
        const limiter = new RateLimiter({ maxRequestsPerWindow: 1 });

        limiter.allowRequest(); // Consume only token
        expect(limiter.allowRequest()).toBe(false);

        limiter.reset();

        expect(limiter.allowRequest()).toBe(true);
      });
    });

    describe('token bucket refill', () => {
      it('should refill tokens over time', () => {
        vi.useFakeTimers();
        const limiter = new RateLimiter({
          maxRequestsPerWindow: 10,
          windowMs: 10000, // 10 seconds, so 1 token per second
        });

        // Consume all tokens
        for (let i = 0; i < 10; i++) {
          limiter.allowRequest();
        }

        expect(limiter.allowRequest()).toBe(false);

        // Advance time by 5 seconds (should refill ~5 tokens)
        vi.advanceTimersByTime(5000);

        // Should have tokens again
        expect(limiter.allowRequest()).toBe(true);

        vi.useRealTimers();
      });

      it('should not exceed max tokens', () => {
        vi.useFakeTimers();
        const limiter = new RateLimiter({
          maxRequestsPerWindow: 5,
          windowMs: 5000,
        });

        // Wait a long time
        vi.advanceTimersByTime(100000);

        const stats = limiter.getStats();

        // Should be capped at max
        expect(stats.availableTokens).toBe(5);

        vi.useRealTimers();
      });

      it('should refill gradually', () => {
        vi.useFakeTimers();
        const limiter = new RateLimiter({
          maxRequestsPerWindow: 100,
          windowMs: 1000, // 100 tokens per second = 0.1 per ms
        });

        // Consume 50 tokens
        for (let i = 0; i < 50; i++) {
          limiter.allowRequest();
        }

        // Wait 100ms (should add ~10 tokens)
        vi.advanceTimersByTime(100);

        const stats = limiter.getStats();

        expect(stats.availableTokens).toBeGreaterThan(50);
        expect(stats.availableTokens).toBeLessThanOrEqual(60);

        vi.useRealTimers();
      });
    });

    describe('request lifecycle', () => {
      it('should handle complete request lifecycle', () => {
        const limiter = new RateLimiter();

        // Check if allowed
        expect(limiter.allowRequest()).toBe(true);

        // Start processing
        limiter.startRequest();
        expect(limiter.getStats().concurrent).toBe(1);

        // End processing
        limiter.endRequest();
        expect(limiter.getStats().concurrent).toBe(0);
      });

      it('should handle queued request lifecycle', () => {
        const limiter = new RateLimiter({ maxConcurrent: 1 });

        // First request
        limiter.allowRequest();
        limiter.startRequest();

        // Second request must queue
        expect(limiter.allowQueue()).toBe(true);
        limiter.queueRequest();
        expect(limiter.getStats().queued).toBe(1);

        // First request ends
        limiter.endRequest();

        // Dequeue second request
        limiter.dequeueRequest();
        expect(limiter.getStats().queued).toBe(0);

        // Start second request
        limiter.allowRequest();
        limiter.startRequest();
        expect(limiter.getStats().concurrent).toBe(1);
      });
    });
  });

  describe('withRateLimit', () => {
    it('should execute function when allowed', async () => {
      const limiter = new RateLimiter();
      const mockFn = vi.fn(async () => 'result');

      const result = await withRateLimit(limiter, mockFn);

      expect(result).toBe('result');
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should throw RateLimitError when rate limited', async () => {
      const limiter = new RateLimiter({ maxRequestsPerWindow: 1 });

      // Consume the only token
      limiter.allowRequest();

      await expect(
        withRateLimit(limiter, async () => 'result')
      ).rejects.toThrow(RateLimitError);
    });

    it('should increment concurrent count during execution', async () => {
      const limiter = new RateLimiter();
      let concurrentDuringExecution = 0;

      await withRateLimit(limiter, async () => {
        concurrentDuringExecution = limiter.getStats().concurrent;
      });

      expect(concurrentDuringExecution).toBe(1);
    });

    it('should decrement concurrent count after execution', async () => {
      const limiter = new RateLimiter();

      await withRateLimit(limiter, async () => {
        // Do something
      });

      const stats = limiter.getStats();
      expect(stats.concurrent).toBe(0);
    });

    it('should decrement count even on error', async () => {
      const limiter = new RateLimiter();

      await expect(
        withRateLimit(limiter, async () => {
          throw new Error('Test error');
        })
      ).rejects.toThrow('Test error');

      const stats = limiter.getStats();
      expect(stats.concurrent).toBe(0);
    });

    it('should include stats in RateLimitError', async () => {
      const limiter = new RateLimiter({ maxRequestsPerWindow: 1 });

      limiter.allowRequest();

      try {
        await withRateLimit(limiter, async () => 'result');
        expect.fail('Should have thrown RateLimitError');
      } catch (error) {
        expect(error).toBeInstanceOf(RateLimitError);
        expect((error as RateLimitError).stats).toBeDefined();
      }
    });

    it('should handle concurrent executions', async () => {
      const limiter = new RateLimiter({ maxConcurrent: 3 });
      const mockFn = vi.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'result';
      });

      const promises = [
        withRateLimit(limiter, mockFn),
        withRateLimit(limiter, mockFn),
        withRateLimit(limiter, mockFn),
      ];

      const results = await Promise.all(promises);

      expect(results).toEqual(['result', 'result', 'result']);
      expect(limiter.getStats().concurrent).toBe(0);
    });

    it('should throw when concurrent limit exceeded', async () => {
      const limiter = new RateLimiter({ maxConcurrent: 1 });

      // Start first request (doesn't await)
      const promise1 = withRateLimit(limiter, async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return 'result1';
      });

      // Try to start second request while first is running
      await expect(
        withRateLimit(limiter, async () => 'result2')
      ).rejects.toThrow(RateLimitError);

      // Wait for first to complete
      await promise1;
    });
  });

  describe('globalRateLimiter', () => {
    it('should be initialized', () => {
      expect(globalRateLimiter).toBeDefined();
    });

    it('should have default configuration', () => {
      const stats = globalRateLimiter.getStats();

      expect(stats.maxConcurrent).toBeGreaterThan(0);
      expect(stats.maxQueued).toBeGreaterThan(0);
      expect(stats.maxTokens).toBeGreaterThan(0);
    });

    it('should be usable', () => {
      const allowed = globalRateLimiter.allowRequest();

      expect(typeof allowed).toBe('boolean');
    });
  });

  describe('edge cases', () => {
    it('should handle zero max concurrent', () => {
      const limiter = new RateLimiter({ maxConcurrent: 0 });

      expect(limiter.allowRequest()).toBe(false);
    });

    it('should handle very high request rate', () => {
      vi.useFakeTimers();
      const limiter = new RateLimiter({
        maxRequestsPerWindow: 1000,
        windowMs: 1000,
      });

      let allowed = 0;
      for (let i = 0; i < 1000; i++) {
        if (limiter.allowRequest()) allowed++;
      }

      expect(allowed).toBe(1000);
      expect(limiter.allowRequest()).toBe(false);

      vi.useRealTimers();
    });

    it('should handle very small window', () => {
      const limiter = new RateLimiter({
        maxRequestsPerWindow: 10,
        windowMs: 10, // 10ms window
      });

      expect(limiter.allowRequest()).toBe(true);
    });

    it('should handle zero queue size', () => {
      const limiter = new RateLimiter({ maxQueueSize: 0 });

      expect(limiter.allowQueue()).toBe(false);
    });

    it('should handle rapid start/end cycles', () => {
      const limiter = new RateLimiter({ maxConcurrent: 5 });

      for (let i = 0; i < 100; i++) {
        limiter.startRequest();
        limiter.endRequest();
      }

      const stats = limiter.getStats();
      expect(stats.concurrent).toBe(0);
    });

    it('should handle multiple resets', () => {
      const limiter = new RateLimiter();

      for (let i = 0; i < 10; i++) {
        limiter.allowRequest();
        limiter.reset();
      }

      const stats = limiter.getStats();
      expect(stats.availableTokens).toBe(stats.maxTokens);
    });
  });
});
