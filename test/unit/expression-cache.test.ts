/**
 * @file expression-cache.test.ts
 * @description Unit tests for expression-cache module
 *
 * Tests LRU cache implementation for parsed expressions including:
 * - Cache operations (get, set, clear)
 * - LRU eviction policy
 * - Cache statistics tracking
 * - Cache key generation
 * - Cached expression retrieval
 *
 * @since 3.1.1
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  LRUCache,
  generateCacheKey,
  getCachedExpression,
  getCacheStats,
  expressionCache,
} from '../../src/expression-cache.js';

describe('expression-cache', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    // Clear global cache before each test
    expressionCache.clear();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    expressionCache.clear();
  });

  describe('LRUCache', () => {
    describe('constructor', () => {
      it('should create cache with specified max size', () => {
        const cache = new LRUCache<string>(10);
        const stats = cache.getStats();

        expect(stats.maxSize).toBe(10);
        expect(stats.size).toBe(0);
      });

      it('should initialize with zero hits and misses', () => {
        const cache = new LRUCache<number>(5);
        const stats = cache.getStats();

        expect(stats.hits).toBe(0);
        expect(stats.misses).toBe(0);
        expect(stats.hitRate).toBe(0);
      });
    });

    describe('get', () => {
      it('should return undefined for non-existent key', () => {
        const cache = new LRUCache<string>(5);

        const value = cache.get('nonexistent');

        expect(value).toBeUndefined();
      });

      it('should return cached value for existing key', () => {
        const cache = new LRUCache<string>(5);

        cache.set('key1', 'value1');
        const value = cache.get('key1');

        expect(value).toBe('value1');
      });

      it('should increment hits counter on cache hit', () => {
        const cache = new LRUCache<string>(5);

        cache.set('key1', 'value1');
        cache.get('key1');

        const stats = cache.getStats();
        expect(stats.hits).toBe(1);
      });

      it('should increment misses counter on cache miss', () => {
        const cache = new LRUCache<string>(5);

        cache.get('nonexistent');

        const stats = cache.getStats();
        expect(stats.misses).toBe(1);
      });

      it('should track multiple hits and misses', () => {
        const cache = new LRUCache<string>(5);

        cache.set('key1', 'value1');
        cache.get('key1'); // hit
        cache.get('key1'); // hit
        cache.get('key2'); // miss
        cache.get('key3'); // miss

        const stats = cache.getStats();
        expect(stats.hits).toBe(2);
        expect(stats.misses).toBe(2);
      });
    });

    describe('set', () => {
      it('should store value in cache', () => {
        const cache = new LRUCache<string>(5);

        cache.set('key1', 'value1');

        expect(cache.get('key1')).toBe('value1');
      });

      it('should update existing key', () => {
        const cache = new LRUCache<string>(5);

        cache.set('key1', 'value1');
        cache.set('key1', 'updated');

        expect(cache.get('key1')).toBe('updated');
      });

      it('should update cache size', () => {
        const cache = new LRUCache<string>(5);

        cache.set('key1', 'value1');
        cache.set('key2', 'value2');

        const stats = cache.getStats();
        expect(stats.size).toBe(2);
      });

      it('should not exceed max size when updating existing key', () => {
        const cache = new LRUCache<string>(2);

        cache.set('key1', 'value1');
        cache.set('key2', 'value2');
        cache.set('key1', 'updated'); // Update, not add

        const stats = cache.getStats();
        expect(stats.size).toBe(2);
      });

      it('should store different types of values', () => {
        const cache = new LRUCache<any>(5);

        cache.set('string', 'text');
        cache.set('number', 42);
        cache.set('object', { a: 1 });
        cache.set('array', [1, 2, 3]);

        expect(cache.get('string')).toBe('text');
        expect(cache.get('number')).toBe(42);
        expect(cache.get('object')).toEqual({ a: 1 });
        expect(cache.get('array')).toEqual([1, 2, 3]);
      });
    });

    describe('LRU eviction', () => {
      it('should evict least recently used entry when full', () => {
        const cache = new LRUCache<string>(3);

        cache.set('key1', 'value1');
        cache.set('key2', 'value2');
        cache.set('key3', 'value3');

        // Cache is full, adding key4 should evict key1 (oldest)
        cache.set('key4', 'value4');

        expect(cache.get('key1')).toBeUndefined();
        expect(cache.get('key2')).toBe('value2');
        expect(cache.get('key3')).toBe('value3');
        expect(cache.get('key4')).toBe('value4');
      });

      it('should update LRU order on access', () => {
        vi.useFakeTimers();
        const cache = new LRUCache<string>(3);

        vi.setSystemTime(1000);
        cache.set('key1', 'value1');

        vi.setSystemTime(2000);
        cache.set('key2', 'value2');

        vi.setSystemTime(3000);
        cache.set('key3', 'value3');

        // Access key1 to make it more recent
        vi.setSystemTime(4000);
        cache.get('key1');

        // Add key4, should evict key2 (now oldest)
        vi.setSystemTime(5000);
        cache.set('key4', 'value4');

        expect(cache.get('key1')).toBe('value1'); // Still present
        expect(cache.get('key2')).toBeUndefined(); // Evicted
        expect(cache.get('key3')).toBe('value3');
        expect(cache.get('key4')).toBe('value4');

        vi.useRealTimers();
      });

      it('should maintain max size during evictions', () => {
        const cache = new LRUCache<string>(2);

        cache.set('key1', 'value1');
        cache.set('key2', 'value2');
        cache.set('key3', 'value3');
        cache.set('key4', 'value4');

        const stats = cache.getStats();
        expect(stats.size).toBe(2);
        expect(stats.maxSize).toBe(2);
      });

      it('should handle single-entry cache', () => {
        const cache = new LRUCache<string>(1);

        cache.set('key1', 'value1');
        cache.set('key2', 'value2');

        expect(cache.get('key1')).toBeUndefined();
        expect(cache.get('key2')).toBe('value2');

        const stats = cache.getStats();
        expect(stats.size).toBe(1);
      });

      it('should evict multiple times as needed', () => {
        const cache = new LRUCache<string>(2);

        for (let i = 1; i <= 10; i++) {
          cache.set(`key${i}`, `value${i}`);
        }

        // Should only have the last 2 entries
        expect(cache.get('key9')).toBe('value9');
        expect(cache.get('key10')).toBe('value10');
        expect(cache.get('key1')).toBeUndefined();

        const stats = cache.getStats();
        expect(stats.size).toBe(2);
      });
    });

    describe('clear', () => {
      it('should remove all entries', () => {
        const cache = new LRUCache<string>(5);

        cache.set('key1', 'value1');
        cache.set('key2', 'value2');
        cache.set('key3', 'value3');

        cache.clear();

        expect(cache.get('key1')).toBeUndefined();
        expect(cache.get('key2')).toBeUndefined();
        expect(cache.get('key3')).toBeUndefined();

        const stats = cache.getStats();
        expect(stats.size).toBe(0);
      });

      it('should reset hit and miss counters', () => {
        const cache = new LRUCache<string>(5);

        cache.set('key1', 'value1');
        cache.get('key1'); // hit
        cache.get('key2'); // miss

        cache.clear();

        const stats = cache.getStats();
        expect(stats.hits).toBe(0);
        expect(stats.misses).toBe(0);
        expect(stats.hitRate).toBe(0);
      });

      it('should allow adding entries after clear', () => {
        const cache = new LRUCache<string>(5);

        cache.set('key1', 'value1');
        cache.clear();
        cache.set('key2', 'value2');

        expect(cache.get('key2')).toBe('value2');

        const stats = cache.getStats();
        expect(stats.size).toBe(1);
      });
    });

    describe('getStats', () => {
      it('should return correct statistics', () => {
        const cache = new LRUCache<string>(10);

        cache.set('key1', 'value1');
        cache.set('key2', 'value2');
        cache.get('key1'); // hit
        cache.get('key3'); // miss

        const stats = cache.getStats();

        expect(stats.size).toBe(2);
        expect(stats.maxSize).toBe(10);
        expect(stats.hits).toBe(1);
        expect(stats.misses).toBe(1);
        expect(stats.hitRate).toBe(0.5); // 1/(1+1)
      });

      it('should calculate hit rate correctly', () => {
        const cache = new LRUCache<string>(5);

        cache.set('key1', 'value1');
        cache.get('key1'); // hit
        cache.get('key1'); // hit
        cache.get('key1'); // hit
        cache.get('key2'); // miss

        const stats = cache.getStats();

        expect(stats.hits).toBe(3);
        expect(stats.misses).toBe(1);
        expect(stats.hitRate).toBe(0.75); // 3/4
      });

      it('should return 0 hit rate when no operations', () => {
        const cache = new LRUCache<string>(5);

        const stats = cache.getStats();

        expect(stats.hitRate).toBe(0);
      });

      it('should return 100% hit rate when all hits', () => {
        const cache = new LRUCache<string>(5);

        cache.set('key1', 'value1');
        cache.get('key1'); // hit
        cache.get('key1'); // hit

        const stats = cache.getStats();

        expect(stats.hitRate).toBe(1);
      });

      it('should return 0% hit rate when all misses', () => {
        const cache = new LRUCache<string>(5);

        cache.get('key1'); // miss
        cache.get('key2'); // miss

        const stats = cache.getStats();

        expect(stats.hitRate).toBe(0);
      });
    });
  });

  describe('generateCacheKey', () => {
    it('should return expression when no scope', () => {
      const key = generateCacheKey('x^2 + 2*x');

      expect(key).toBe('x^2 + 2*x');
    });

    it('should return expression when scope is empty', () => {
      const key = generateCacheKey('x^2 + 2*x', {});

      expect(key).toBe('x^2 + 2*x');
    });

    it('should include scope keys in cache key', () => {
      const key = generateCacheKey('x^2 + 2*x', { x: 5 });

      expect(key).toBe('x^2 + 2*x::scope:x');
    });

    it('should sort scope keys for consistent cache keys', () => {
      const key1 = generateCacheKey('x + y', { x: 1, y: 2 });
      const key2 = generateCacheKey('x + y', { y: 2, x: 1 });

      expect(key1).toBe(key2);
      expect(key1).toBe('x + y::scope:x,y');
    });

    it('should include multiple scope keys', () => {
      const key = generateCacheKey('x + y + z', { x: 1, y: 2, z: 3 });

      expect(key).toBe('x + y + z::scope:x,y,z');
    });

    it('should ignore scope values, only use keys', () => {
      const key1 = generateCacheKey('x^2', { x: 1 });
      const key2 = generateCacheKey('x^2', { x: 100 });

      expect(key1).toBe(key2);
    });

    it('should create different keys for different expressions', () => {
      const key1 = generateCacheKey('x^2');
      const key2 = generateCacheKey('x^3');

      expect(key1).not.toBe(key2);
    });

    it('should create different keys for different scope keys', () => {
      const key1 = generateCacheKey('expr', { x: 1 });
      const key2 = generateCacheKey('expr', { y: 1 });

      expect(key1).not.toBe(key2);
    });
  });

  describe('getCachedExpression', () => {
    beforeEach(() => {
      expressionCache.clear();
    });

    it('should compute value on cache miss', () => {
      const computeFn = vi.fn(() => 'computed');

      const result = getCachedExpression('x^2', computeFn);

      expect(result).toBe('computed');
      expect(computeFn).toHaveBeenCalledTimes(1);
    });

    it('should return cached value on cache hit', () => {
      const computeFn = vi.fn(() => 'computed');

      const result1 = getCachedExpression('x^2', computeFn);
      const result2 = getCachedExpression('x^2', computeFn);

      expect(result1).toBe('computed');
      expect(result2).toBe('computed');
      expect(computeFn).toHaveBeenCalledTimes(1); // Only called once
    });

    it('should cache result for future calls', () => {
      const computeFn = vi.fn(() => ({ value: 42 }));

      const result1 = getCachedExpression('expr', computeFn);
      const result2 = getCachedExpression('expr', computeFn);

      expect(result1).toBe(result2); // Same object reference
      expect(computeFn).toHaveBeenCalledTimes(1);
    });

    it('should use scope in cache key', () => {
      const computeFn1 = vi.fn(() => 'result1');
      const computeFn2 = vi.fn(() => 'result2');

      // Different scopes, same expression: each must be computed (not shared).
      getCachedExpression('expr', computeFn1, { x: 1 });
      getCachedExpression('expr', computeFn2, { y: 1 });

      // Different scopes, both computed
      expect(computeFn1).toHaveBeenCalledTimes(1);
      expect(computeFn2).toHaveBeenCalledTimes(1);
    });

    it('should cache expressions with scope', () => {
      const computeFn = vi.fn(() => 'computed');

      getCachedExpression('expr', computeFn, { x: 1 });
      getCachedExpression('expr', computeFn, { x: 2 }); // Different value, same key

      expect(computeFn).toHaveBeenCalledTimes(1); // Cached
    });

    it('should handle different expression types', () => {
      const numberFn = vi.fn(() => 42);
      const stringFn = vi.fn(() => 'text');
      const objectFn = vi.fn(() => ({ a: 1 }));

      const num = getCachedExpression('num', numberFn);
      const str = getCachedExpression('str', stringFn);
      const obj = getCachedExpression('obj', objectFn);

      expect(num).toBe(42);
      expect(str).toBe('text');
      expect(obj).toEqual({ a: 1 });
    });

    it('should update cache statistics', () => {
      const computeFn = vi.fn(() => 'value');

      getCachedExpression('expr1', computeFn); // miss
      getCachedExpression('expr1', computeFn); // hit
      getCachedExpression('expr2', computeFn); // miss

      const stats = getCacheStats();

      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(2);
    });
  });

  describe('getCacheStats', () => {
    beforeEach(() => {
      expressionCache.clear();
    });

    it('should return global cache statistics', () => {
      const stats = getCacheStats();

      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('maxSize');
      expect(stats).toHaveProperty('hits');
      expect(stats).toHaveProperty('misses');
      expect(stats).toHaveProperty('hitRate');
    });

    it('should reflect operations on global cache', () => {
      const computeFn = vi.fn(() => 'value');

      getCachedExpression('expr', computeFn);
      getCachedExpression('expr', computeFn);

      const stats = getCacheStats();

      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.size).toBe(1);
    });

    it('should update after clear', () => {
      getCachedExpression('expr', () => 'value');

      expressionCache.clear();

      const stats = getCacheStats();

      expect(stats.size).toBe(0);
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });
  });

  describe('global expressionCache', () => {
    it('should be initialized with environment variable size', () => {
      const stats = expressionCache.getStats();

      // Default is 1000 or EXPRESSION_CACHE_SIZE env var
      expect(stats.maxSize).toBeGreaterThan(0);
    });

    it('should be shared across getCachedExpression calls', () => {
      const computeFn = vi.fn(() => 'value');

      getCachedExpression('shared', computeFn);
      getCachedExpression('shared', computeFn);

      expect(computeFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('edge cases', () => {
    it('should handle very long expression strings', () => {
      const cache = new LRUCache<string>(5);
      const longExpr = 'x'.repeat(10000);

      cache.set(longExpr, 'value');

      expect(cache.get(longExpr)).toBe('value');
    });

    it('should handle special characters in expressions', () => {
      const cache = new LRUCache<string>(5);

      cache.set('x^2 + 2*x - 3', 'value1');
      cache.set('sin(x) + cos(y)', 'value2');
      cache.set('(a + b) / (c - d)', 'value3');

      expect(cache.get('x^2 + 2*x - 3')).toBe('value1');
      expect(cache.get('sin(x) + cos(y)')).toBe('value2');
      expect(cache.get('(a + b) / (c - d)')).toBe('value3');
    });

    it('should handle empty string as key', () => {
      const cache = new LRUCache<string>(5);

      cache.set('', 'empty');

      expect(cache.get('')).toBe('empty');
    });

    it('should handle null and undefined values', () => {
      const cache = new LRUCache<any>(5);

      cache.set('null-key', null);

      // get() returns undefined for cache miss OR cached undefined
      // To distinguish, we'd need to check has() which doesn't exist
      // So we test that null can be stored
      expect(cache.get('null-key')).toBe(null);
    });

    it('should handle very large cache sizes', () => {
      const cache = new LRUCache<number>(10000);

      for (let i = 0; i < 10000; i++) {
        cache.set(`key${i}`, i);
      }

      const stats = cache.getStats();
      expect(stats.size).toBe(10000);
    });

    it('should handle rapid successive operations', () => {
      const cache = new LRUCache<number>(100);

      for (let i = 0; i < 1000; i++) {
        cache.set(`key${i % 100}`, i);
        cache.get(`key${i % 50}`);
      }

      const stats = cache.getStats();
      expect(stats.size).toBeLessThanOrEqual(100);
    });
  });
});
