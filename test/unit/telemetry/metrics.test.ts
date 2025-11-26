/**
 * @file metrics.test.ts
 * @description Unit tests for Prometheus metrics
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  resetMetrics,
  recordOperation,
  recordError,
  updateQueueSize,
  updateWorkerMetrics,
  recordCacheOperation,
  recordRateLimitHit,
  recordBackpressureEvent,
  recordInputSize,
  getMetrics,
  getMetricsJSON,
  operationDuration,
  operationCount,
  queueSize,
  workerCount,
  cacheOperations,
  rateLimitHits,
  backpressureEvents,
} from '../../../src/telemetry/metrics.js';

describe('Prometheus Metrics', () => {
  beforeEach(() => {
    resetMetrics();
  });

  describe('recordOperation', () => {
    it('should record operation metrics', async () => {
      recordOperation('evaluate', 'mathjs', 50, 'success');

      const metrics = await getMetrics();

      expect(metrics).toContain('math_mcp_operation_duration_seconds');
      expect(metrics).toContain('math_mcp_operation_total');
      expect(metrics).toContain('operation="evaluate"');
      expect(metrics).toContain('tier="mathjs"');
      expect(metrics).toContain('status="success"');
    });

    it('should record multiple operations', async () => {
      recordOperation('matrixMultiply', 'wasm', 10, 'success');
      recordOperation('statsMean', 'mathjs', 5, 'success');
      recordOperation('matrixDeterminant', 'worker', 100, 'success');

      const metrics = await getMetrics();

      expect(metrics).toContain('operation="matrixMultiply"');
      expect(metrics).toContain('operation="statsMean"');
      expect(metrics).toContain('operation="matrixDeterminant"');
    });

    it('should record operation errors', async () => {
      recordOperation('evaluate', 'mathjs', 5, 'error');

      const metrics = await getMetrics();

      expect(metrics).toContain('status="error"');
    });

    it('should record operation timeouts', async () => {
      recordOperation('evaluate', 'mathjs', 30000, 'timeout');

      const metrics = await getMetrics();

      expect(metrics).toContain('status="timeout"');
    });
  });

  describe('recordError', () => {
    it('should record error metrics', async () => {
      recordError('ValidationError', 'evaluate');

      const metrics = await getMetrics();

      expect(metrics).toContain('math_mcp_errors_total');
      expect(metrics).toContain('type="ValidationError"');
      expect(metrics).toContain('operation="evaluate"');
    });

    it('should record multiple error types', async () => {
      recordError('ValidationError', 'evaluate');
      recordError('TimeoutError', 'matrixMultiply');
      recordError('MathError', 'solve');

      const metrics = await getMetrics();

      expect(metrics).toContain('ValidationError');
      expect(metrics).toContain('TimeoutError');
      expect(metrics).toContain('MathError');
    });
  });

  describe('updateQueueSize', () => {
    it('should update queue size gauge', async () => {
      updateQueueSize('task', 42);

      const metrics = await getMetrics();

      expect(metrics).toContain('math_mcp_queue_size');
      expect(metrics).toContain('type="task"');
      expect(metrics).toContain('42');
    });

    it('should update multiple queue types', async () => {
      updateQueueSize('task', 10);
      updateQueueSize('rate_limit', 5);
      updateQueueSize('backpressure', 3);

      const metrics = await getMetrics();

      expect(metrics).toContain('type="task"');
      expect(metrics).toContain('type="rate_limit"');
      expect(metrics).toContain('type="backpressure"');
    });

    it('should handle zero queue size', async () => {
      updateQueueSize('task', 0);

      const metrics = await getMetrics();

      expect(metrics).toContain('0');
    });
  });

  describe('updateWorkerMetrics', () => {
    it('should update worker metrics', async () => {
      updateWorkerMetrics(10, 7, 3);

      const metrics = await getMetrics();

      expect(metrics).toContain('math_mcp_workers');
      expect(metrics).toContain('state="total"');
      expect(metrics).toContain('state="idle"');
      expect(metrics).toContain('state="busy"');
    });

    it('should handle all workers idle', async () => {
      updateWorkerMetrics(5, 5, 0);

      const metrics = await getMetrics();

      expect(metrics).toContain('state="idle"');
    });

    it('should handle all workers busy', async () => {
      updateWorkerMetrics(8, 0, 8);

      const metrics = await getMetrics();

      expect(metrics).toContain('state="busy"');
    });
  });

  describe('recordCacheOperation', () => {
    it('should record cache hit', async () => {
      recordCacheOperation('expression', true, 50);

      const metrics = await getMetrics();

      expect(metrics).toContain('math_mcp_cache_operations_total');
      expect(metrics).toContain('type="expression"');
      expect(metrics).toContain('result="hit"');
    });

    it('should record cache miss', async () => {
      recordCacheOperation('expression', false, 50);

      const metrics = await getMetrics();

      expect(metrics).toContain('result="miss"');
    });

    it('should record cache size', async () => {
      recordCacheOperation('expression', true, 100);

      const metrics = await getMetrics();

      expect(metrics).toContain('math_mcp_cache_size');
      expect(metrics).toContain('100');
    });

    it('should work without size parameter', async () => {
      recordCacheOperation('result', true);

      const metrics = await getMetrics();

      expect(metrics).toContain('math_mcp_cache_operations_total');
    });
  });

  describe('recordRateLimitHit', () => {
    it('should record rate limit hits', async () => {
      recordRateLimitHit();
      recordRateLimitHit();
      recordRateLimitHit();

      const metrics = await getMetrics();

      expect(metrics).toContain('math_mcp_rate_limit_hits_total');
      expect(metrics).toContain('3');
    });
  });

  describe('recordBackpressureEvent', () => {
    it('should record backpressure REJECT events', async () => {
      recordBackpressureEvent('REJECT', 'applied');

      const metrics = await getMetrics();

      expect(metrics).toContain('math_mcp_backpressure_events_total');
      expect(metrics).toContain('strategy="REJECT"');
      expect(metrics).toContain('action="applied"');
    });

    it('should record backpressure WAIT events', async () => {
      recordBackpressureEvent('WAIT', 'applied');

      const metrics = await getMetrics();

      expect(metrics).toContain('strategy="WAIT"');
    });

    it('should record backpressure SHED events', async () => {
      recordBackpressureEvent('SHED', 'applied');

      const metrics = await getMetrics();

      expect(metrics).toContain('strategy="SHED"');
    });

    it('should record backpressure recovered events', async () => {
      recordBackpressureEvent('REJECT', 'recovered');

      const metrics = await getMetrics();

      expect(metrics).toContain('action="recovered"');
    });
  });

  describe('recordInputSize', () => {
    it('should record matrix input size', async () => {
      recordInputSize('matrix', 10000); // 100x100 matrix

      const metrics = await getMetrics();

      expect(metrics).toContain('math_mcp_input_size');
      expect(metrics).toContain('type="matrix"');
    });

    it('should record array input size', async () => {
      recordInputSize('array', 50000);

      const metrics = await getMetrics();

      expect(metrics).toContain('type="array"');
    });

    it('should record expression input size', async () => {
      recordInputSize('expression', 250);

      const metrics = await getMetrics();

      expect(metrics).toContain('type="expression"');
    });
  });

  describe('getMetrics', () => {
    it('should return Prometheus-formatted metrics', async () => {
      recordOperation('test', 'mathjs', 10, 'success');

      const metrics = await getMetrics();

      expect(metrics).toContain('# HELP');
      expect(metrics).toContain('# TYPE');
      expect(typeof metrics).toBe('string');
    });

    it('should include default metrics', async () => {
      const metrics = await getMetrics();

      // Default Node.js metrics
      expect(metrics).toContain('process_cpu');
      expect(metrics).toContain('nodejs_');
    });
  });

  describe('getMetricsJSON', () => {
    it('should return metrics as JSON', async () => {
      recordOperation('test', 'mathjs', 10, 'success');

      const json = await getMetricsJSON();

      expect(Array.isArray(json)).toBe(true);
      expect(json.length).toBeGreaterThan(0);
    });

    it('should include metric metadata', async () => {
      recordOperation('test', 'mathjs', 10, 'success');

      const json = await getMetricsJSON();
      const operationMetric = json.find((m) => m.name === 'math_mcp_operation_total');

      expect(operationMetric).toBeDefined();
      expect(operationMetric?.help).toBeDefined();
      expect(operationMetric?.type).toBeDefined();
    });
  });

  describe('resetMetrics', () => {
    it('should reset all metrics', async () => {
      recordOperation('test', 'mathjs', 10, 'success');
      updateQueueSize('task', 100);

      resetMetrics();

      const metrics = await getMetrics();

      // Should only have default metrics, not custom ones
      expect(metrics).not.toContain('operation="test"');
    });
  });

  describe('metric instances', () => {
    it('should expose operationDuration histogram', () => {
      expect(operationDuration).toBeDefined();
      expect(typeof operationDuration.observe).toBe('function');
    });

    it('should expose operationCount counter', () => {
      expect(operationCount).toBeDefined();
      expect(typeof operationCount.inc).toBe('function');
    });

    it('should expose queueSize gauge', () => {
      expect(queueSize).toBeDefined();
      expect(typeof queueSize.set).toBe('function');
    });

    it('should expose workerCount gauge', () => {
      expect(workerCount).toBeDefined();
      expect(typeof workerCount.set).toBe('function');
    });

    it('should expose cacheOperations counter', () => {
      expect(cacheOperations).toBeDefined();
      expect(typeof cacheOperations.inc).toBe('function');
    });

    it('should expose rateLimitHits counter', () => {
      expect(rateLimitHits).toBeDefined();
      expect(typeof rateLimitHits.inc).toBe('function');
    });

    it('should expose backpressureEvents counter', () => {
      expect(backpressureEvents).toBeDefined();
      expect(typeof backpressureEvents.inc).toBe('function');
    });
  });
});
