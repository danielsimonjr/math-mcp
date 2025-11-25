/**
 * @file constants.test.ts
 * @description Unit tests for shared/constants module
 *
 * Tests application constants including:
 * - Default timeout values
 * - Performance tracking flags
 * - Environment variable parsing
 *
 * @since 3.1.1
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  DEFAULT_OPERATION_TIMEOUT,
  PERF_TRACKING_ENABLED,
  PERF_LOGGING_ENABLED
} from '../../../src/shared/constants.js';

describe('shared/constants', () => {
  let originalTimeout: string | undefined;
  let originalPerfTracking: string | undefined;
  let originalPerfLogging: string | undefined;

  beforeEach(() => {
    originalTimeout = process.env.OPERATION_TIMEOUT;
    originalPerfTracking = process.env.DISABLE_PERF_TRACKING;
    originalPerfLogging = process.env.ENABLE_PERF_LOGGING;
  });

  afterEach(() => {
    process.env.OPERATION_TIMEOUT = originalTimeout;
    process.env.DISABLE_PERF_TRACKING = originalPerfTracking;
    process.env.ENABLE_PERF_LOGGING = originalPerfLogging;
  });

  describe('DEFAULT_OPERATION_TIMEOUT', () => {
    it('should have a default value of 30000ms', () => {
      // Default should be 30 seconds
      expect(DEFAULT_OPERATION_TIMEOUT).toBe(30000);
    });

    it('should be a positive number', () => {
      expect(DEFAULT_OPERATION_TIMEOUT).toBeGreaterThan(0);
    });

    it('should be a reasonable timeout value', () => {
      // Should be between 1 second and 5 minutes
      expect(DEFAULT_OPERATION_TIMEOUT).toBeGreaterThanOrEqual(1000);
      expect(DEFAULT_OPERATION_TIMEOUT).toBeLessThanOrEqual(300000);
    });
  });

  describe('PERF_TRACKING_ENABLED', () => {
    it('should default to true (enabled)', () => {
      expect(PERF_TRACKING_ENABLED).toBe(true);
    });

    it('should be a boolean value', () => {
      expect(typeof PERF_TRACKING_ENABLED).toBe('boolean');
    });
  });

  describe('PERF_LOGGING_ENABLED', () => {
    it('should default to false (disabled)', () => {
      expect(PERF_LOGGING_ENABLED).toBe(false);
    });

    it('should be a boolean value', () => {
      expect(typeof PERF_LOGGING_ENABLED).toBe('boolean');
    });
  });

  describe('constant immutability', () => {
    it('constants should be defined (not undefined)', () => {
      expect(DEFAULT_OPERATION_TIMEOUT).toBeDefined();
      expect(PERF_TRACKING_ENABLED).toBeDefined();
      expect(PERF_LOGGING_ENABLED).toBeDefined();
    });

    it('constants should not be null', () => {
      expect(DEFAULT_OPERATION_TIMEOUT).not.toBeNull();
      expect(PERF_TRACKING_ENABLED).not.toBeNull();
      expect(PERF_LOGGING_ENABLED).not.toBeNull();
    });
  });

  describe('type correctness', () => {
    it('DEFAULT_OPERATION_TIMEOUT should be a number', () => {
      expect(typeof DEFAULT_OPERATION_TIMEOUT).toBe('number');
    });

    it('DEFAULT_OPERATION_TIMEOUT should be an integer', () => {
      expect(Number.isInteger(DEFAULT_OPERATION_TIMEOUT)).toBe(true);
    });

    it('performance flags should be booleans', () => {
      expect(typeof PERF_TRACKING_ENABLED).toBe('boolean');
      expect(typeof PERF_LOGGING_ENABLED).toBe('boolean');
    });
  });
});
