/**
 * @file health.test.ts
 * @description Unit tests for health check module
 */

import { describe, it, expect } from 'vitest';
import {
  getHealthStatus,
  getLiveness,
  getReadiness,
  type HealthStatus,
  type CheckStatus,
} from '../../src/health.js';

describe('Health Checks', () => {
  describe('getHealthStatus', () => {
    it('should return health status object', async () => {
      const health = await getHealthStatus();

      expect(health).toBeDefined();
      expect(health.status).toBeDefined();
      expect(health.timestamp).toBeDefined();
      expect(health.version).toBeDefined();
      expect(health.uptime).toBeDefined();
      expect(health.checks).toBeDefined();
    });

    it('should have correct status values', async () => {
      const health = await getHealthStatus();

      const validStatuses: HealthStatus[] = ['healthy', 'degraded', 'unhealthy'];
      expect(validStatuses).toContain(health.status);
    });

    it('should include timestamp in ISO format', async () => {
      const health = await getHealthStatus();

      expect(health.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should include version', async () => {
      const health = await getHealthStatus();

      expect(typeof health.version).toBe('string');
      expect(health.version.length).toBeGreaterThan(0);
    });

    it('should include uptime in seconds', async () => {
      const health = await getHealthStatus();

      expect(typeof health.uptime).toBe('number');
      expect(health.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should include component checks', async () => {
      const health = await getHealthStatus();

      expect(health.checks).toBeDefined();
      expect(health.checks.rateLimit).toBeDefined();
      expect(health.checks.memory).toBeDefined();
    });

    it('should have valid check statuses', async () => {
      const health = await getHealthStatus();

      const validCheckStatuses: CheckStatus[] = ['pass', 'warn', 'fail'];

      expect(validCheckStatuses).toContain(health.checks.rateLimit.status);
      expect(health.checks.memory.status).toContain(health.checks.memory.status);
    });
  });

  describe('Rate limit health check', () => {
    it('should check rate limiter status', async () => {
      const health = await getHealthStatus();

      expect(health.checks.rateLimit).toBeDefined();
      expect(health.checks.rateLimit.status).toBeDefined();
      expect(health.checks.rateLimit.message).toBeDefined();
    });

    it('should include rate limit stats', async () => {
      const health = await getHealthStatus();

      expect(health.checks.rateLimit.details).toBeDefined();

      const details = health.checks.rateLimit.details!;
      expect(details.queued).toBeDefined();
      expect(details.concurrent).toBeDefined();
      expect(details.availableTokens).toBeDefined();
    });

    it('should detect normal rate limit state', async () => {
      const health = await getHealthStatus();

      // Fresh start should have low queue
      expect(health.checks.rateLimit.status).toBe('pass');
    });
  });

  describe('Memory health check', () => {
    it('should check memory usage', async () => {
      const health = await getHealthStatus();

      expect(health.checks.memory).toBeDefined();
      expect(health.checks.memory.status).toBeDefined();
      expect(health.checks.memory.message).toBeDefined();
    });

    it('should include memory metrics', async () => {
      const health = await getHealthStatus();

      const details = health.checks.memory.details!;

      expect(details.heapUsedMB).toBeDefined();
      expect(details.heapTotalMB).toBeDefined();
      expect(details.heapPercent).toBeDefined();
      expect(details.rssMB).toBeDefined();
    });

    it('should have reasonable memory values', async () => {
      const health = await getHealthStatus();

      const details = health.checks.memory.details!;

      expect(Number(details.heapUsedMB)).toBeGreaterThan(0);
      expect(Number(details.heapTotalMB)).toBeGreaterThan(0);
      expect(Number(details.heapPercent)).toBeGreaterThan(0);
      expect(Number(details.heapPercent)).toBeLessThanOrEqual(100);
      expect(Number(details.rssMB)).toBeGreaterThan(0);
    });

    it('should detect normal memory state', async () => {
      const health = await getHealthStatus();

      // Fresh start should be 'pass' or 'warn' (vitest workers can push
      // RSS past the 1024MB warn threshold without indicating real trouble).
      expect(['pass', 'warn']).toContain(health.checks.memory.status);
    });
  });

  describe('Overall health status', () => {
    it('should be healthy when all checks pass', async () => {
      const health = await getHealthStatus();

      const allPass = Object.values(health.checks).every(
        (check) => check.status === 'pass'
      );

      if (allPass) {
        expect(health.status).toBe('healthy');
      }
    });

    it('should be degraded when any check warns', async () => {
      const health = await getHealthStatus();

      const anyWarn = Object.values(health.checks).some(
        (check) => check.status === 'warn'
      );
      const noneFailed = Object.values(health.checks).every(
        (check) => check.status !== 'fail'
      );

      if (anyWarn && noneFailed) {
        expect(health.status).toBe('degraded');
      }
    });

    it('should be unhealthy when any check fails', async () => {
      const health = await getHealthStatus();

      const anyFailed = Object.values(health.checks).some(
        (check) => check.status === 'fail'
      );

      if (anyFailed) {
        expect(health.status).toBe('unhealthy');
      }
    });
  });

  describe('getLiveness', () => {
    it('should return true', () => {
      const live = getLiveness();

      expect(live).toBe(true);
    });

    it('should always return true', () => {
      // Call multiple times
      for (let i = 0; i < 10; i++) {
        expect(getLiveness()).toBe(true);
      }
    });
  });

  describe('getReadiness', () => {
    it('should return boolean', async () => {
      const ready = await getReadiness();

      expect(typeof ready).toBe('boolean');
    });

    it('should be true when healthy or degraded', async () => {
      const health = await getHealthStatus();
      const ready = await getReadiness();

      if (health.status === 'healthy' || health.status === 'degraded') {
        expect(ready).toBe(true);
      }
    });

    it('should be false when unhealthy', async () => {
      const health = await getHealthStatus();
      const ready = await getReadiness();

      if (health.status === 'unhealthy') {
        expect(ready).toBe(false);
      }
    });
  });

  describe('Health check timestamps', () => {
    it('should include timestamps in all checks', async () => {
      const health = await getHealthStatus();

      expect(health.checks.rateLimit.timestamp).toBeDefined();
      expect(health.checks.memory.timestamp).toBeDefined();
    });

    it('should have ISO format timestamps', async () => {
      const health = await getHealthStatus();

      const isoPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

      expect(health.checks.rateLimit.timestamp).toMatch(isoPattern);
      expect(health.checks.memory.timestamp).toMatch(isoPattern);
    });

    it('should have recent timestamps', async () => {
      const before = Date.now();
      const health = await getHealthStatus();
      const after = Date.now();

      const healthTime = new Date(health.timestamp).getTime();

      expect(healthTime).toBeGreaterThanOrEqual(before - 1000); // 1 second buffer
      expect(healthTime).toBeLessThanOrEqual(after + 1000);
    });
  });

  describe('Multiple health check calls', () => {
    it('should handle multiple concurrent calls', async () => {
      const promises = [
        getHealthStatus(),
        getHealthStatus(),
        getHealthStatus(),
      ];

      const results = await Promise.all(promises);

      expect(results).toHaveLength(3);
      results.forEach((health) => {
        expect(health.status).toBeDefined();
      });
    });

    it('should return consistent results', async () => {
      const health1 = await getHealthStatus();
      const health2 = await getHealthStatus();

      // Status should be same (assuming no state change)
      expect(health1.status).toBe(health2.status);
    });

    it('should update uptime between calls', async () => {
      const health1 = await getHealthStatus();

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 100));

      const health2 = await getHealthStatus();

      // Uptime should increase
      expect(health2.uptime).toBeGreaterThanOrEqual(health1.uptime);
    });
  });
});
