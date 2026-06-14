/**
 * @file handler-utils.test.ts
 * @description Unit tests for the shared handler utilities.
 *
 * Covers the boilerplate every tool handler routes through:
 * successResponse / errorResponse shape, executeHandler timing +
 * logging hand-off, withErrorHandling failure path. The acceleration
 * adapter and tool handlers depend on these wrappers, so a regression
 * here would silently change every tool's response envelope.
 *
 * @since 3.5.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  successResponse,
  errorResponse,
  executeHandler,
  withErrorHandling,
  type ToolResponse,
} from '../../src/handler-utils.js';
import { ValidationError, MathMCPError } from '../../src/errors.js';

describe('handler-utils', () => {
  describe('successResponse', () => {
    it('wraps a primitive result with content + isError=false', () => {
      const r = successResponse(42);
      expect(r.isError).toBe(false);
      expect(r.content).toHaveLength(1);
      expect(r.content[0].type).toBe('text');
      expect(JSON.parse(r.content[0].text)).toEqual({ result: 42 });
    });

    it('handles object results without losing fields', () => {
      const r = successResponse({ value: 1, label: 'x' });
      expect(JSON.parse(r.content[0].text)).toEqual({ result: { value: 1, label: 'x' } });
    });

    it('handles null and undefined results', () => {
      expect(JSON.parse(successResponse(null).content[0].text)).toEqual({ result: null });
      // JSON.stringify drops undefined fields entirely
      expect(successResponse(undefined).isError).toBe(false);
    });
  });

  describe('errorResponse', () => {
    it('marks the response as error and includes the message', () => {
      const r = errorResponse(new Error('boom'));
      expect(r.isError).toBe(true);
      const parsed = JSON.parse(r.content[0].text);
      expect(parsed.error).toBe('boom');
      expect(parsed.errorType).toBe('Error');
    });

    it('uses the MathMCPError subclass name when applicable', () => {
      const r = errorResponse(new ValidationError('bad input'));
      const parsed = JSON.parse(r.content[0].text);
      expect(parsed.errorType).toBe('ValidationError');
      expect(parsed.error).toBe('bad input');
    });

    it('coerces non-Error throws to a string message', () => {
      const r = errorResponse('plain string');
      const parsed = JSON.parse(r.content[0].text);
      expect(parsed.error).toBe('plain string');
      expect(parsed.errorType).toBe('Error');
    });

    it('coerces a thrown number to a string message', () => {
      const r = errorResponse(404);
      const parsed = JSON.parse(r.content[0].text);
      expect(parsed.error).toBe('404');
    });
  });

  describe('executeHandler', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('returns the inner result on success', async () => {
      const result = await executeHandler({ operationName: 'op' }, async () => 7);
      expect(result).toBe(7);
    });

    it('passes through async errors unchanged (does not wrap them)', async () => {
      const err = new ValidationError('bad');
      await expect(
        executeHandler({ operationName: 'op' }, async () => { throw err; })
      ).rejects.toBe(err);
    });

    it('preserves MathMCPError subclass identity through the wrapper', async () => {
      const err = new ValidationError('subtle');
      const caught: unknown = await executeHandler({ operationName: 'op' }, async () => { throw err; })
        .catch(e => e);
      expect(caught).toBeInstanceOf(ValidationError);
      expect(caught).toBeInstanceOf(MathMCPError);
      expect((caught as Error).message).toBe('subtle');
    });

    it('logs the context object when provided', async () => {
      // We don't assert on logger internals, just confirm logContext is harmless
      // and the operation still resolves.
      await expect(
        executeHandler(
          { operationName: 'evaluate', logContext: { expression: '1+1' } },
          async () => 'ok'
        )
      ).resolves.toBe('ok');
    });
  });

  describe('withErrorHandling', () => {
    it('returns the handler response on success', async () => {
      const handler = async (n: number): Promise<ToolResponse> => successResponse(n * 2);
      const r = await withErrorHandling(handler, 5);
      expect(r.isError).toBe(false);
      expect(JSON.parse(r.content[0].text)).toEqual({ result: 10 });
    });

    it('converts a thrown handler error into an error response', async () => {
      const handler = async (_n: number): Promise<ToolResponse> => { throw new ValidationError('nope'); };
      const r = await withErrorHandling(handler, 0);
      expect(r.isError).toBe(true);
      const parsed = JSON.parse(r.content[0].text);
      expect(parsed.errorType).toBe('ValidationError');
      expect(parsed.error).toBe('nope');
    });

    it('handles non-Error throws (string) without crashing', async () => {
      const handler = async (): Promise<ToolResponse> => { throw 'string-throw'; };
      const r = await withErrorHandling(handler, undefined);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content[0].text).error).toBe('string-throw');
    });
  });
});
