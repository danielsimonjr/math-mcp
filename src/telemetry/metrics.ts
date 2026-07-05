/**
 * @file metrics.ts
 * @description Prometheus metrics for telemetry and observability
 *
 * Provides:
 * - Operation duration histograms
 * - Operation counters (success/failure)
 * - Rate limit metrics
 * - Cache hit/miss metrics
 * - Error counters
 *
 * @module telemetry/metrics
 * @since 3.2.0
 */

import * as promClient from 'prom-client';
import { logger } from '../utils.js';

/**
 * Prometheus registry for all metrics.
 * Separate from default registry to avoid conflicts.
 */
export const register = new promClient.Registry();

/**
 * Add default Node.js metrics (memory, CPU, etc.)
 */
promClient.collectDefaultMetrics({
  register,
  prefix: 'math_mcp_',
});

/**
 * Histogram for operation duration tracking.
 *
 * Labels:
 * - operation: The operation type (evaluate, matrixMultiply, etc.)
 * - tier: compute tier label (currently unused; MathTS computes directly)
 * - status: Operation status (success, error, timeout)
 *
 * Buckets optimized for mathematical operations:
 * - 1ms (very fast operations)
 * - 10ms (fast operations)
 * - 100ms (normal operations)
 * - 1s (slow operations)
 * - 10s (very slow operations)
 * - 30s (near timeout)
 */
export const operationDuration = new promClient.Histogram({
  name: 'math_mcp_operation_duration_seconds',
  help: 'Duration of mathematical operations in seconds',
  labelNames: ['operation', 'tier', 'status'],
  buckets: [0.001, 0.01, 0.1, 1, 10, 30],
  registers: [register],
});

/**
 * Counter for total operations.
 *
 * Labels:
 * - operation: The operation type
 * - tier: compute tier label (currently unused; MathTS computes directly)
 * - status: success or error
 */
export const operationCount = new promClient.Counter({
  name: 'math_mcp_operation_total',
  help: 'Total number of mathematical operations',
  labelNames: ['operation', 'tier', 'status'],
  registers: [register],
});

/**
 * Counter for rate limit hits.
 *
 * Tracks how often rate limiting is triggered.
 */
export const rateLimitHits = new promClient.Counter({
  name: 'math_mcp_rate_limit_hits_total',
  help: 'Number of times rate limiting was triggered',
  registers: [register],
});

/**
 * Counter for rate limit queue operations.
 *
 * Labels:
 * - action: queued, processed, rejected
 */
export const rateLimitQueue = new promClient.Counter({
  name: 'math_mcp_rate_limit_queue_total',
  help: 'Rate limit queue operations',
  labelNames: ['action'],
  registers: [register],
});

/**
 * Counter for cache operations.
 *
 * Labels:
 * - type: Cache type (expression, result)
 * - result: hit or miss
 */
export const cacheOperations = new promClient.Counter({
  name: 'math_mcp_cache_operations_total',
  help: 'Cache hit/miss statistics',
  labelNames: ['type', 'result'],
  registers: [register],
});

/**
 * Gauge for cache size.
 *
 * Labels:
 * - type: Cache type (expression, result)
 */
export const cacheSize = new promClient.Gauge({
  name: 'math_mcp_cache_size',
  help: 'Current number of items in cache',
  labelNames: ['type'],
  registers: [register],
});

/**
 * Counter for errors by type.
 *
 * Labels:
 * - type: Error type (ValidationError, MathError, TimeoutError, etc.)
 * - operation: Operation that failed
 */
export const errorCount = new promClient.Counter({
  name: 'math_mcp_errors_total',
  help: 'Total number of errors by type',
  labelNames: ['type', 'operation'],
  registers: [register],
});

/**
 * Histogram for input sizes.
 *
 * Labels:
 * - type: matrix, array, expression
 *
 * Buckets for input sizes (elements/characters):
 * - 10, 100, 1K, 10K, 100K, 1M
 */
export const inputSize = new promClient.Histogram({
  name: 'math_mcp_input_size',
  help: 'Size of inputs (matrix elements, array length, expression length)',
  labelNames: ['type'],
  buckets: [10, 100, 1000, 10000, 100000, 1000000],
  registers: [register],
});

/**
 * Gauge for active MCP connections.
 */
export const activeConnections = new promClient.Gauge({
  name: 'math_mcp_active_connections',
  help: 'Number of active MCP connections',
  registers: [register],
});

/**
 * Counter for MCP requests by tool.
 *
 * Labels:
 * - tool: Tool name (evaluate, matrixMultiply, etc.)
 * - status: success or error
 */
export const mcpRequests = new promClient.Counter({
  name: 'math_mcp_requests_total',
  help: 'Total MCP requests by tool',
  labelNames: ['tool', 'status'],
  registers: [register],
});

/**
 * Helper function to record operation metrics.
 *
 * @param operation - Operation name
 * @param tier - Compute tier label (currently unused; MathTS computes directly)
 * @param durationMs - Duration in milliseconds
 * @param status - Operation status
 *
 * @example
 * ```typescript
 * const start = Date.now();
 * try {
 *   const result = await matrixMultiply(a, b);
 *   recordOperation('matrixMultiply', 'mathts', Date.now() - start, 'success');
 * } catch (error) {
 *   recordOperation('matrixMultiply', 'mathts', Date.now() - start, 'error');
 * }
 * ```
 */
export function recordOperation(
  operation: string,
  tier: string,
  durationMs: number,
  status: 'success' | 'error' | 'timeout'
): void {
  const durationSeconds = durationMs / 1000;

  operationDuration.observe(
    { operation, tier, status },
    durationSeconds
  );

  operationCount.inc({ operation, tier, status });

  logger.debug('Recorded operation metrics', {
    operation,
    tier,
    durationMs,
    status,
  });
}

/**
 * Helper function to record error metrics.
 *
 * @param errorType - Type of error
 * @param operation - Operation that failed
 *
 * @example
 * ```typescript
 * try {
 *   await evaluate(expr);
 * } catch (error) {
 *   recordError(error.name, 'evaluate');
 * }
 * ```
 */
export function recordError(errorType: string, operation: string): void {
  errorCount.inc({ type: errorType, operation });

  logger.debug('Recorded error metrics', { errorType, operation });
}

/**
 * Helper function to record cache operations.
 *
 * @param type - Cache type
 * @param hit - Whether it was a cache hit
 * @param size - Current cache size (optional)
 *
 * @example
 * ```typescript
 * const cached = expressionCache.get(key);
 * recordCacheOperation('expression', cached !== null, expressionCache.size);
 * ```
 */
export function recordCacheOperation(
  type: string,
  hit: boolean,
  size?: number
): void {
  const result = hit ? 'hit' : 'miss';
  cacheOperations.inc({ type, result });

  if (size !== undefined) {
    cacheSize.set({ type }, size);
  }
}

/**
 * Helper function to record rate limit events.
 *
 * @example
 * ```typescript
 * if (rateLimiter.isLimitExceeded()) {
 *   recordRateLimitHit();
 * }
 * ```
 */
export function recordRateLimitHit(): void {
  rateLimitHits.inc();
}

/**
 * Helper function to record input size.
 *
 * @param type - Input type (matrix, array, expression)
 * @param size - Size of input
 *
 * @example
 * ```typescript
 * recordInputSize('matrix', rows * cols);
 * recordInputSize('expression', expression.length);
 * ```
 */
export function recordInputSize(type: string, size: number): void {
  inputSize.observe({ type }, size);
}

/**
 * Get all metrics in Prometheus format.
 *
 * @returns Prometheus-formatted metrics string
 *
 * @example
 * ```typescript
 * app.get('/metrics', async (req, res) => {
 *   res.set('Content-Type', register.contentType);
 *   res.end(await getMetrics());
 * });
 * ```
 */
export async function getMetrics(): Promise<string> {
  return register.metrics();
}

/**
 * Get metrics in JSON format.
 *
 * @returns Metrics as JSON array
 */
export async function getMetricsJSON(): Promise<promClient.MetricObjectWithValues<promClient.MetricValue<string>>[]> {
  return register.getMetricsAsJSON();
}

/**
 * Reset all metrics (useful for testing).
 */
export function resetMetrics(): void {
  register.resetMetrics();
  logger.info('All metrics reset');
}

logger.info('Prometheus metrics initialized', {
  metricsCount: register.getSingleMetric !== undefined ? 'available' : 'unavailable',
});
