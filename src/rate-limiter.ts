/**
 * @file rate-limiter.ts
 * @description Rate limiting and request throttling for MCP server
 *
 * Implements multiple layers of protection against DoS attacks:
 * - Token bucket rate limiting (requests per time window)
 * - Concurrent request limits (max in-flight requests)
 * - Request queue size limits (max pending requests)
 *
 * @module rate-limiter
 * @since 3.1.0
 */

import { logger } from './utils.js';
import { RateLimitError } from './errors.js';

/**
 * Configuration for rate limiter
 */
export interface RateLimiterConfig {
  /** Maximum requests per time window */
  maxRequestsPerWindow: number;
  /** Time window in milliseconds */
  windowMs: number;
  /** Maximum concurrent requests */
  maxConcurrent: number;
  /** Maximum queued requests */
  maxQueueSize: number;
}

/**
 * Default rate limiter configuration
 * Conservative limits to prevent DoS while allowing legitimate use
 */
const DEFAULT_CONFIG: RateLimiterConfig = {
  maxRequestsPerWindow: 100,    // 100 requests
  windowMs: 60000,               // per 60 seconds
  maxConcurrent: 10,             // max 10 concurrent requests
  maxQueueSize: 50,              // max 50 queued requests
};

/**
 * Token bucket implementation for rate limiting
 */
class TokenBucket {
  private tokens: number;
  private readonly maxTokens: number;
  private readonly refillRate: number; // tokens per millisecond
  private lastRefill: number;

  /**
   * Creates a new token bucket
   *
   * @param {number} maxTokens - Maximum tokens in bucket
   * @param {number} refillRate - Tokens added per millisecond
   */
  constructor(maxTokens: number, refillRate: number) {
    this.maxTokens = maxTokens;
    this.tokens = maxTokens;
    this.refillRate = refillRate;
    this.lastRefill = Date.now();
  }

  /**
   * Attempts to consume a token
   *
   * @returns {boolean} True if token was consumed, false if bucket is empty
   */
  consume(): boolean {
    this.refill();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }

    return false;
  }

  /**
   * Refills tokens based on elapsed time
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const tokensToAdd = elapsed * this.refillRate;

    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  /**
   * Gets current token count
   *
   * @returns {number} Current number of tokens
   */
  getTokens(): number {
    this.refill();
    return this.tokens;
  }

  /**
   * Resets bucket to full capacity
   */
  reset(): void {
    this.tokens = this.maxTokens;
    this.lastRefill = Date.now();
  }
}

/**
 * Rate limiter for MCP server
 *
 * Provides multiple layers of protection:
 * 1. Token bucket rate limiting (requests per time window)
 * 2. Concurrent request tracking (max in-flight)
 * 3. Queue size limits (max pending)
 *
 * @example
 * ```typescript
 * const limiter = new RateLimiter();
 *
 * // Check if request is allowed
 * if (!limiter.allowRequest()) {
 *   throw new RateLimitError('Rate limit exceeded');
 * }
 *
 * // Mark request as started
 * limiter.startRequest();
 *
 * try {
 *   await handleRequest();
 * } finally {
 *   // Always end request in finally block
 *   limiter.endRequest();
 * }
 * ```
 */
export class RateLimiter {
  private readonly config: RateLimiterConfig;
  private readonly bucket: TokenBucket;
  private concurrentRequests: number = 0;
  private queuedRequests: number = 0;

  /**
   * Creates a new rate limiter
   *
   * @param {Partial<RateLimiterConfig>} [config] - Optional configuration overrides
   */
  constructor(config?: Partial<RateLimiterConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Calculate refill rate: tokens per millisecond
    const refillRate = this.config.maxRequestsPerWindow / this.config.windowMs;
    this.bucket = new TokenBucket(this.config.maxRequestsPerWindow, refillRate);

    logger.info('Rate limiter initialized', {
      maxRequestsPerWindow: this.config.maxRequestsPerWindow,
      windowMs: this.config.windowMs,
      maxConcurrent: this.config.maxConcurrent,
      maxQueueSize: this.config.maxQueueSize,
    });
  }

  /**
   * Checks if a request is allowed under rate limits
   *
   * @returns {boolean} True if request is allowed
   */
  allowRequest(): boolean {
    // Check concurrent request limit
    if (this.concurrentRequests >= this.config.maxConcurrent) {
      logger.warn('Concurrent request limit exceeded', {
        current: this.concurrentRequests,
        max: this.config.maxConcurrent,
      });
      return false;
    }

    // Check token bucket (rate limit)
    if (!this.bucket.consume()) {
      logger.warn('Rate limit exceeded', {
        tokens: this.bucket.getTokens(),
        max: this.config.maxRequestsPerWindow,
      });
      return false;
    }

    return true;
  }

  /**
   * Checks if request can be queued
   *
   * @returns {boolean} True if request can be queued
   */
  allowQueue(): boolean {
    if (this.queuedRequests >= this.config.maxQueueSize) {
      logger.warn('Queue size limit exceeded', {
        current: this.queuedRequests,
        max: this.config.maxQueueSize,
      });
      return false;
    }
    return true;
  }

  /**
   * Marks a request as started
   * Call this when beginning to process a request
   */
  startRequest(): void {
    this.concurrentRequests++;
    logger.debug('Request started', {
      concurrent: this.concurrentRequests,
      queued: this.queuedRequests,
    });
  }

  /**
   * Marks a request as ended
   * Call this when request processing completes (success or error)
   */
  endRequest(): void {
    this.concurrentRequests = Math.max(0, this.concurrentRequests - 1);
    logger.debug('Request ended', {
      concurrent: this.concurrentRequests,
      queued: this.queuedRequests,
    });
  }

  /**
   * Marks a request as queued
   */
  queueRequest(): void {
    this.queuedRequests++;
    logger.debug('Request queued', {
      concurrent: this.concurrentRequests,
      queued: this.queuedRequests,
    });
  }

  /**
   * Marks a queued request as dequeued
   */
  dequeueRequest(): void {
    this.queuedRequests = Math.max(0, this.queuedRequests - 1);
    logger.debug('Request dequeued', {
      concurrent: this.concurrentRequests,
      queued: this.queuedRequests,
    });
  }

  /**
   * Gets current rate limiter statistics
   *
   * @returns {Object} Current statistics
   */
  getStats(): {
    concurrent: number;
    queued: number;
    availableTokens: number;
    maxConcurrent: number;
    maxQueued: number;
    maxTokens: number;
  } {
    return {
      concurrent: this.concurrentRequests,
      queued: this.queuedRequests,
      availableTokens: Math.floor(this.bucket.getTokens()),
      maxConcurrent: this.config.maxConcurrent,
      maxQueued: this.config.maxQueueSize,
      maxTokens: this.config.maxRequestsPerWindow,
    };
  }

  /**
   * Resets all rate limiting counters
   * Use with caution - typically only for testing
   */
  reset(): void {
    this.bucket.reset();
    this.concurrentRequests = 0;
    this.queuedRequests = 0;
    logger.info('Rate limiter reset');
  }
}

/**
 * Middleware-style rate limiting wrapper
 *
 * @template T
 * @param {RateLimiter} limiter - Rate limiter instance
 * @param {() => Promise<T>} fn - Function to execute with rate limiting
 * @returns {Promise<T>} Result of function execution
 * @throws {RateLimitError} If rate limit is exceeded
 *
 * @example
 * ```typescript
 * const limiter = new RateLimiter();
 *
 * const result = await withRateLimit(limiter, async () => {
 *   return await processRequest();
 * });
 * ```
 */
export async function withRateLimit<T>(
  limiter: RateLimiter,
  fn: () => Promise<T>
): Promise<T> {
  // Check if request is allowed
  if (!limiter.allowRequest()) {
    const stats = limiter.getStats();
    throw new RateLimitError(
      'Rate limit exceeded. Please try again later.',
      stats
    );
  }

  // Mark request as started
  limiter.startRequest();

  try {
    // Execute function
    return await fn();
  } finally {
    // Always mark request as ended
    limiter.endRequest();
  }
}

/**
 * Global rate limiter instance
 * Can be configured via environment variables
 */
export const globalRateLimiter = new RateLimiter({
  maxRequestsPerWindow: parseInt(process.env.MAX_REQUESTS_PER_WINDOW || '100', 10),
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
  maxConcurrent: parseInt(process.env.MAX_CONCURRENT_REQUESTS || '10', 10),
  maxQueueSize: parseInt(process.env.MAX_QUEUE_SIZE || '50', 10),
});
