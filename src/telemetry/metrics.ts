/**
 * @file metrics.ts
 * @description Prometheus metrics for telemetry and observability
 *
 * Provides:
 * - Operation duration histograms
 * - Operation counters (success/failure)
 * - Queue size gauges
 * - Worker pool metrics
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
 * - tier: Acceleration tier used (mathjs, wasm, worker, gpu)
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
 * - tier: Acceleration tier used
 * - status: success or error
 */
export const operationCount = new promClient.Counter({
  name: 'math_mcp_operation_total',
  help: 'Total number of mathematical operations',
  labelNames: ['operation', 'tier', 'status'],
  registers: [register],
});

/**
 * Gauge for current queue sizes.
 *
 * Labels:
 * - type: Queue type (task, rate_limit, backpressure)
 */
export const queueSize = new promClient.Gauge({
  name: 'math_mcp_queue_size',
  help: 'Current size of various queues',
  labelNames: ['type'],
  registers: [register],
});

/**
 * Gauge for worker pool state.
 *
 * Labels:
 * - state: Worker state (total, idle, busy)
 */
export const workerCount = new promClient.Gauge({
  name: 'math_mcp_workers',
  help: 'Number of workers in various states',
  labelNames: ['state'],
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
 * Counter for backpressure events.
 *
 * Labels:
 * - strategy: REJECT, WAIT, SHED
 * - action: applied, recovered
 */
export const backpressureEvents = new promClient.Counter({
  name: 'math_mcp_backpressure_events_total',
  help: 'Backpressure strategy applications',
  labelNames: ['strategy', 'action'],
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
 * Gauge for WASM module state.
 *
 * Labels:
 * - module: matrix or statistics
 * - state: loaded or error
 */
export const wasmModuleState = new promClient.Gauge({
  name: 'math_mcp_wasm_module_state',
  help: 'WASM module initialization state (1=loaded, 0=error)',
  labelNames: ['module'],
  registers: [register],
});

/**
 * Helper function to record operation metrics.
 *
 * @param operation - Operation name
 * @param tier - Acceleration tier
 * @param durationMs - Duration in milliseconds
 * @param status - Operation status
 *
 * @example
 * ```typescript
 * const start = Date.now();
 * try {
 *   const result = await matrixMultiply(a, b);
 *   recordOperation('matrixMultiply', 'wasm', Date.now() - start, 'success');
 * } catch (error) {
 *   recordOperation('matrixMultiply', 'mathjs', Date.now() - start, 'error');
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
 * Helper function to update queue size metrics.
 *
 * @param type - Queue type
 * @param size - Current queue size
 *
 * @example
 * ```typescript
 * updateQueueSize('task', taskQueue.length);
 * ```
 */
export function updateQueueSize(type: string, size: number): void {
  queueSize.set({ type }, size);
}

/**
 * Helper function to update worker metrics.
 *
 * @param total - Total workers
 * @param idle - Idle workers
 * @param busy - Busy workers
 *
 * @example
 * ```typescript
 * const stats = workerPool.getStats();
 * updateWorkerMetrics(stats.totalWorkers, stats.idleWorkers, stats.busyWorkers);
 * ```
 */
export function updateWorkerMetrics(
  total: number,
  idle: number,
  busy: number
): void {
  workerCount.set({ state: 'total' }, total);
  workerCount.set({ state: 'idle' }, idle);
  workerCount.set({ state: 'busy' }, busy);
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
 * Helper function to record backpressure events.
 *
 * @param strategy - Backpressure strategy
 * @param action - applied or recovered
 *
 * @example
 * ```typescript
 * recordBackpressureEvent('REJECT', 'applied');
 * ```
 */
export function recordBackpressureEvent(
  strategy: 'REJECT' | 'WAIT' | 'SHED',
  action: 'applied' | 'recovered'
): void {
  backpressureEvents.inc({ strategy, action });
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
