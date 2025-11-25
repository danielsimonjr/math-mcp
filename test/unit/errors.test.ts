/**
 * @file errors.test.ts
 * @description Unit tests for custom error classes
 *
 * Tests all custom error types including:
 * - MathMCPError (base error)
 * - ValidationError
 * - WasmError
 * - TimeoutError
 * - SizeLimitError
 * - ComplexityError
 * - RateLimitError
 *
 * @since 3.1.1
 */

import { describe, it, expect } from 'vitest';
import {
  MathMCPError,
  ValidationError,
  WasmError,
  TimeoutError,
  SizeLimitError,
  ComplexityError,
  RateLimitError,
} from '../../src/errors.js';

describe('errors', () => {
  describe('MathMCPError', () => {
    it('should create error with message', () => {
      const error = new MathMCPError('Test error');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(MathMCPError);
      expect(error.message).toBe('Test error');
      expect(error.name).toBe('MathMCPError');
    });

    it('should support error cause', () => {
      const cause = new Error('Original error');
      const error = new MathMCPError('Wrapped error', { cause });

      expect(error.cause).toBe(cause);
    });

    it('should have stack trace', () => {
      const error = new MathMCPError('Test error');

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('MathMCPError');
      expect(error.stack).toContain('Test error');
    });

    it('should be catchable as Error', () => {
      try {
        throw new MathMCPError('Test');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    });

    it('should be distinguishable from generic Error', () => {
      const mathError = new MathMCPError('Math error');
      const genericError = new Error('Generic error');

      expect(mathError).toBeInstanceOf(MathMCPError);
      expect(genericError).not.toBeInstanceOf(MathMCPError);
    });
  });

  describe('ValidationError', () => {
    it('should create validation error with message', () => {
      const error = new ValidationError('Invalid input');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(MathMCPError);
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.message).toBe('Invalid input');
      expect(error.name).toBe('ValidationError');
    });

    it('should support error cause', () => {
      const cause = new Error('Parse error');
      const error = new ValidationError('Validation failed', { cause });

      expect(error.cause).toBe(cause);
    });

    it('should inherit from MathMCPError', () => {
      const error = new ValidationError('Test');

      expect(error).toBeInstanceOf(MathMCPError);
      expect(error).toBeInstanceOf(ValidationError);
    });

    it('should have correct error name', () => {
      const error = new ValidationError('Test');

      expect(error.name).toBe('ValidationError');
    });
  });

  describe('WasmError', () => {
    it('should create WASM error with message', () => {
      const error = new WasmError('WASM initialization failed');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(MathMCPError);
      expect(error).toBeInstanceOf(WasmError);
      expect(error.message).toBe('WASM initialization failed');
      expect(error.name).toBe('WasmError');
    });

    it('should support error cause', () => {
      const cause = new Error('Module load failed');
      const error = new WasmError('WASM error', { cause });

      expect(error.cause).toBe(cause);
    });

    it('should inherit from MathMCPError', () => {
      const error = new WasmError('Test');

      expect(error).toBeInstanceOf(MathMCPError);
      expect(error).toBeInstanceOf(WasmError);
    });

    it('should have correct error name', () => {
      const error = new WasmError('Test');

      expect(error.name).toBe('WasmError');
    });
  });

  describe('TimeoutError', () => {
    it('should create timeout error with message', () => {
      const error = new TimeoutError('Operation timed out');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(MathMCPError);
      expect(error).toBeInstanceOf(TimeoutError);
      expect(error.message).toBe('Operation timed out');
      expect(error.name).toBe('TimeoutError');
    });

    it('should support error cause', () => {
      const cause = new Error('Underlying timeout');
      const error = new TimeoutError('Timeout error', { cause });

      expect(error.cause).toBe(cause);
    });

    it('should inherit from MathMCPError', () => {
      const error = new TimeoutError('Test');

      expect(error).toBeInstanceOf(MathMCPError);
      expect(error).toBeInstanceOf(TimeoutError);
    });

    it('should have correct error name', () => {
      const error = new TimeoutError('Test');

      expect(error.name).toBe('TimeoutError');
    });
  });

  describe('SizeLimitError', () => {
    it('should create size limit error with message', () => {
      const error = new SizeLimitError('Matrix too large');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(MathMCPError);
      expect(error).toBeInstanceOf(ValidationError);
      expect(error).toBeInstanceOf(SizeLimitError);
      expect(error.message).toBe('Matrix too large');
      expect(error.name).toBe('SizeLimitError');
    });

    it('should support error cause', () => {
      const cause = new Error('Size exceeded');
      const error = new SizeLimitError('Size limit error', { cause });

      expect(error.cause).toBe(cause);
    });

    it('should inherit from ValidationError', () => {
      const error = new SizeLimitError('Test');

      expect(error).toBeInstanceOf(ValidationError);
      expect(error).toBeInstanceOf(MathMCPError);
      expect(error).toBeInstanceOf(SizeLimitError);
    });

    it('should have correct error name', () => {
      const error = new SizeLimitError('Test');

      expect(error.name).toBe('SizeLimitError');
    });
  });

  describe('ComplexityError', () => {
    it('should create complexity error with message', () => {
      const error = new ComplexityError('Expression too complex');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(MathMCPError);
      expect(error).toBeInstanceOf(ValidationError);
      expect(error).toBeInstanceOf(ComplexityError);
      expect(error.message).toBe('Expression too complex');
      expect(error.name).toBe('ComplexityError');
    });

    it('should support error cause', () => {
      const cause = new Error('Nesting too deep');
      const error = new ComplexityError('Complexity error', { cause });

      expect(error.cause).toBe(cause);
    });

    it('should inherit from ValidationError', () => {
      const error = new ComplexityError('Test');

      expect(error).toBeInstanceOf(ValidationError);
      expect(error).toBeInstanceOf(MathMCPError);
      expect(error).toBeInstanceOf(ComplexityError);
    });

    it('should have correct error name', () => {
      const error = new ComplexityError('Test');

      expect(error.name).toBe('ComplexityError');
    });
  });

  describe('RateLimitError', () => {
    it('should create rate limit error with message', () => {
      const error = new RateLimitError('Rate limit exceeded');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(MathMCPError);
      expect(error).toBeInstanceOf(RateLimitError);
      expect(error.message).toBe('Rate limit exceeded');
      expect(error.name).toBe('RateLimitError');
    });

    it('should support stats parameter', () => {
      const stats = { requests: 100, limit: 50 };
      const error = new RateLimitError('Rate limit exceeded', stats);

      expect(error.stats).toBe(stats);
      expect(error.stats?.requests).toBe(100);
      expect(error.stats?.limit).toBe(50);
    });

    it('should support error cause with stats', () => {
      const cause = new Error('Too many requests');
      const stats = { requests: 100 };
      const error = new RateLimitError('Rate limit error', stats, { cause });

      expect(error.cause).toBe(cause);
      expect(error.stats).toBe(stats);
    });

    it('should allow undefined stats', () => {
      const error = new RateLimitError('Rate limit exceeded');

      expect(error.stats).toBeUndefined();
    });

    it('should inherit from MathMCPError', () => {
      const error = new RateLimitError('Test');

      expect(error).toBeInstanceOf(MathMCPError);
      expect(error).toBeInstanceOf(RateLimitError);
    });

    it('should have correct error name', () => {
      const error = new RateLimitError('Test');

      expect(error.name).toBe('RateLimitError');
    });
  });

  describe('error hierarchy', () => {
    it('should have correct inheritance chain for ValidationError', () => {
      const error = new ValidationError('Test');

      expect(error instanceof Error).toBe(true);
      expect(error instanceof MathMCPError).toBe(true);
      expect(error instanceof ValidationError).toBe(true);
      expect(error instanceof WasmError).toBe(false);
    });

    it('should have correct inheritance chain for SizeLimitError', () => {
      const error = new SizeLimitError('Test');

      expect(error instanceof Error).toBe(true);
      expect(error instanceof MathMCPError).toBe(true);
      expect(error instanceof ValidationError).toBe(true);
      expect(error instanceof SizeLimitError).toBe(true);
      expect(error instanceof ComplexityError).toBe(false);
    });

    it('should have correct inheritance chain for ComplexityError', () => {
      const error = new ComplexityError('Test');

      expect(error instanceof Error).toBe(true);
      expect(error instanceof MathMCPError).toBe(true);
      expect(error instanceof ValidationError).toBe(true);
      expect(error instanceof ComplexityError).toBe(true);
      expect(error instanceof SizeLimitError).toBe(false);
    });

    it('should allow catching specific error types', () => {
      let caughtValidation = false;
      let caughtSizeLimit = false;

      try {
        throw new ValidationError('Test');
      } catch (error) {
        if (error instanceof ValidationError) {
          caughtValidation = true;
        }
      }

      try {
        throw new SizeLimitError('Test');
      } catch (error) {
        if (error instanceof SizeLimitError) {
          caughtSizeLimit = true;
        }
      }

      expect(caughtValidation).toBe(true);
      expect(caughtSizeLimit).toBe(true);
    });

    it('should allow catching by base type', () => {
      let caughtAsMathMCPError = 0;

      const errors = [
        new MathMCPError('Test 1'),
        new ValidationError('Test 2'),
        new WasmError('Test 3'),
        new TimeoutError('Test 4'),
        new SizeLimitError('Test 5'),
        new ComplexityError('Test 6'),
        new RateLimitError('Test 7'),
      ];

      for (const error of errors) {
        try {
          throw error;
        } catch (e) {
          if (e instanceof MathMCPError) {
            caughtAsMathMCPError++;
          }
        }
      }

      expect(caughtAsMathMCPError).toBe(7);
    });
  });
});
