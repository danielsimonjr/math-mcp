/**
 * @file expression-cache.ts
 * @description LRU cache for parsed mathematical expressions
 *
 * Caches compiled expressions to avoid repeated parsing overhead.
 * Uses Least Recently Used (LRU) eviction policy to bound memory usage.
 *
 * Performance benefits:
 * - Avoids re-parsing identical expressions
 * - Reduces CPU overhead for frequently used expressions
 * - Bounded memory usage via LRU eviction
 *
 * @module expression-cache
 * @since 3.1.0
 */

import { logger } from './utils.js';

/**
 * Cache entry structure
 */
interface CacheEntry<T> {
  value: T;
  lastAccessed: number;
}

/**
 * LRU Cache implementation
 *
 * @template T - The type of cached values
 */
export class LRUCache<T> {
  private readonly maxSize: number;
  private readonly cache: Map<string, CacheEntry<T>>;
  private hits: number = 0;
  private misses: number = 0;

  /**
   * Creates a new LRU cache
   *
   * @param {number} maxSize - Maximum number of entries
   */
  constructor(maxSize: number) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  /**
   * Gets a value from the cache
   *
   * @param {string} key - Cache key
   * @returns {T | undefined} Cached value or undefined if not found
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);

    if (entry) {
      // Update last accessed time (LRU)
      entry.lastAccessed = Date.now();
      this.hits++;
      return entry.value;
    }

    this.misses++;
    return undefined;
  }

  /**
   * Sets a value in the cache
   *
   * @param {string} key - Cache key
   * @param {T} value - Value to cache
   */
  set(key: string, value: T): void {
    // Check if we need to evict an entry
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }

    this.cache.set(key, {
      value,
      lastAccessed: Date.now(),
    });
  }

  /**
   * Evicts the least recently used entry
   */
  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  /**
   * Clears the entire cache
   */
  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Gets cache statistics
   *
   * @returns {Object} Cache statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    hits: number;
    misses: number;
    hitRate: number;
  } {
    const total = this.hits + this.misses;
    const hitRate = total > 0 ? this.hits / total : 0;

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      hitRate,
    };
  }
}

/**
 * Global expression cache
 * Caches up to 1000 parsed/compiled expressions
 */
export const expressionCache = new LRUCache<any>(
  parseInt(process.env.EXPRESSION_CACHE_SIZE || '1000', 10)
);

/**
 * Generates a cache key for an expression with scope
 *
 * @param {string} expression - The expression
 * @param {Record<string, number>} [scope] - Optional scope variables
 * @returns {string} Cache key
 */
export function generateCacheKey(
  expression: string,
  scope?: Record<string, number>
): string {
  if (scope && Object.keys(scope).length > 0) {
    // Include scope keys (not values) in cache key
    // Different scopes with same keys can share compiled expression
    const scopeKeys = Object.keys(scope).sort().join(',');
    return `${expression}::scope:${scopeKeys}`;
  }
  return expression;
}

/**
 * Gets or computes a cached expression
 *
 * @template T
 * @param {string} expression - The expression
 * @param {() => T} computeFn - Function to compute value if not cached
 * @param {Record<string, number>} [scope] - Optional scope variables
 * @returns {T} The cached or computed value
 *
 * @example
 * ```typescript
 * const result = getCachedExpression(
 *   'x^2 + 2*x',
 *   () => math.parse('x^2 + 2*x').compile(),
 *   { x: 0 }
 * );
 * ```
 */
export function getCachedExpression<T>(
  expression: string,
  computeFn: () => T,
  scope?: Record<string, number>
): T {
  const key = generateCacheKey(expression, scope);
  const cached = expressionCache.get(key);

  if (cached !== undefined) {
    logger.debug('Expression cache hit', {
      expression: expression.substring(0, 50),
      ...expressionCache.getStats(),
    });
    return cached as T;
  }

  logger.debug('Expression cache miss', {
    expression: expression.substring(0, 50),
  });

  const value = computeFn();
  expressionCache.set(key, value);

  return value;
}

/**
 * Gets cache statistics
 *
 * @returns {Object} Cache statistics
 */
export function getCacheStats(): {
  size: number;
  maxSize: number;
  hits: number;
  misses: number;
  hitRate: number;
} {
  return expressionCache.getStats();
}
