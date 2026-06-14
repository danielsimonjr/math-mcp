/**
 * @file logger.test.ts
 * @description Unit tests for shared/logger module
 *
 * Tests the logging functionality including:
 * - Log level filtering
 * - Message formatting
 * - Stream separation (stdout vs stderr)
 * - Environment variable configuration
 *
 * @since 3.1.1
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger, LogLevel } from '../../../src/shared/logger.js';

describe('shared/logger', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let originalEnv: string | undefined;

  beforeEach(() => {
    // Spy on console methods
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    originalEnv = process.env.LOG_LEVEL;
  });

  afterEach(() => {
    // Restore console methods
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleLogSpy.mockRestore();
    process.env.LOG_LEVEL = originalEnv;
    vi.clearAllMocks();
  });

  describe('LogLevel enum', () => {
    it('should define all log levels', () => {
      expect(LogLevel.ERROR).toBe('error');
      expect(LogLevel.WARN).toBe('warn');
      expect(LogLevel.INFO).toBe('info');
      expect(LogLevel.DEBUG).toBe('debug');
    });
  });

  describe('logger.error', () => {
    it('should log error messages to stderr', () => {
      logger.error('Test error');

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      const call = consoleErrorSpy.mock.calls[0][0];
      expect(call).toContain('ERROR');
      expect(call).toContain('Test error');
    });

    it('should include metadata in error logs', () => {
      logger.error('Test error', { code: 500, details: 'Internal error' });

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      const call = consoleErrorSpy.mock.calls[0][0];
      expect(call).toContain('ERROR');
      expect(call).toContain('Test error');
      expect(call).toContain('"code":500');
      expect(call).toContain('"details":"Internal error"');
    });

    it('should include ISO timestamp', () => {
      logger.error('Test error');

      const call = consoleErrorSpy.mock.calls[0][0];
      // Check for ISO timestamp pattern [YYYY-MM-DDTHH:MM:SS.MMMZ]
      expect(call).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/);
    });
  });

  describe('logger.warn', () => {
    // All levels write to stderr (console.error). stdout is reserved for the
    // MCP JSON-RPC channel — any non-JSON byte on stdout corrupts the protocol.
    it('should log warning messages to stderr', () => {
      logger.warn('Test warning');

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      const call = consoleErrorSpy.mock.calls[0][0];
      expect(call).toContain('WARN');
      expect(call).toContain('Test warning');
    });

    it('should include metadata in warning logs', () => {
      logger.warn('Deprecation warning', { feature: 'old-api' });

      const call = consoleErrorSpy.mock.calls[0][0];
      expect(call).toContain('WARN');
      expect(call).toContain('Deprecation warning');
      expect(call).toContain('"feature":"old-api"');
    });
  });

  describe('logger.info', () => {
    it('should log info messages to stderr', () => {
      logger.info('Test info');

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      const call = consoleErrorSpy.mock.calls[0][0];
      expect(call).toContain('INFO');
      expect(call).toContain('Test info');
    });

    it('should include metadata in info logs', () => {
      logger.info('Server started', { port: 3000, version: '1.0.0' });

      const call = consoleErrorSpy.mock.calls[0][0];
      expect(call).toContain('INFO');
      expect(call).toContain('Server started');
      expect(call).toContain('"port":3000');
      expect(call).toContain('"version":"1.0.0"');
    });
  });

  describe('logger.debug', () => {
    it('should log debug messages to stderr', () => {
      logger.debug('Test debug');

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      const call = consoleErrorSpy.mock.calls[0][0];
      expect(call).toContain('DEBUG');
      expect(call).toContain('Test debug');
    });

    it('should include metadata in debug logs', () => {
      logger.debug('Processing request', { requestId: '123', operation: 'matrix_multiply' });

      const call = consoleErrorSpy.mock.calls[0][0];
      expect(call).toContain('DEBUG');
      expect(call).toContain('Processing request');
      expect(call).toContain('"requestId":"123"');
      expect(call).toContain('"operation":"matrix_multiply"');
    });
  });

  describe('message formatting', () => {
    it('should format messages with timestamp, level, and message', () => {
      logger.info('Formatted message');

      const call = consoleErrorSpy.mock.calls[0][0];
      // Format: [timestamp] LEVEL: message
      expect(call).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] INFO: Formatted message/);
    });

    it('should handle empty metadata gracefully', () => {
      logger.info('No metadata', {});

      const call = consoleErrorSpy.mock.calls[0][0];
      expect(call).toContain('INFO');
      expect(call).toContain('No metadata');
      // Should have metadata object even if empty
      expect(call).toContain('{}');
    });

    it('should handle complex nested metadata', () => {
      logger.info('Complex data', {
        user: { id: 1, name: 'Test' },
        settings: { theme: 'dark', notifications: true }
      });

      const call = consoleErrorSpy.mock.calls[0][0];
      expect(call).toContain('INFO');
      expect(call).toContain('Complex data');
      expect(call).toContain('"user"');
      expect(call).toContain('"id":1');
      expect(call).toContain('"name":"Test"');
    });
  });

  describe('stream separation', () => {
    // The logger routes every level to stderr; stdout (console.log) must never
    // be touched so the MCP stdio JSON-RPC channel stays uncorrupted.
    it('should use stderr for error and warn levels', () => {
      logger.error('Error message');
      logger.warn('Warning message');

      expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
      expect(consoleWarnSpy).not.toHaveBeenCalled();
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should use stderr (not stdout) for info and debug levels', () => {
      logger.info('Info message');
      logger.debug('Debug message');

      expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });
  });
});
