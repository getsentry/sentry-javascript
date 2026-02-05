import { addNonEnumerableProperty } from '@sentry/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isAlreadyCaptured,
  isNotFoundResponse,
  isRedirectResponse,
  safeFlushServerless,
} from '../../../src/server/rsc/responseUtils';

describe('responseUtils', () => {
  describe('isAlreadyCaptured', () => {
    it('should return false for errors without __sentry_captured__', () => {
      expect(isAlreadyCaptured(new Error('test'))).toBe(false);
    });

    it('should return true for errors with __sentry_captured__ set', () => {
      const error = new Error('test');
      addNonEnumerableProperty(error as unknown as Record<string, unknown>, '__sentry_captured__', true);
      expect(isAlreadyCaptured(error)).toBe(true);
    });

    it('should return false for null', () => {
      expect(isAlreadyCaptured(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isAlreadyCaptured(undefined)).toBe(false);
    });

    it('should return false for primitives', () => {
      expect(isAlreadyCaptured('string')).toBe(false);
      expect(isAlreadyCaptured(42)).toBe(false);
    });

    it('should return false for a Proxy that throws on property access', () => {
      const proxy = new Proxy(
        {},
        {
          get() {
            throw new Error('proxy trap');
          },
        },
      );
      expect(isAlreadyCaptured(proxy)).toBe(false);
    });

    it('should return true for truthy non-boolean __sentry_captured__ values', () => {
      const error = { __sentry_captured__: 1 };
      expect(isAlreadyCaptured(error)).toBe(true);
    });

    it('should return false for a frozen object without __sentry_captured__', () => {
      const frozen = Object.freeze({ message: 'frozen error' });
      expect(isAlreadyCaptured(frozen)).toBe(false);
    });
  });

  describe('isRedirectResponse', () => {
    it('should return true for Response with 301 status', () => {
      const response = new Response(null, { status: 301 });
      expect(isRedirectResponse(response)).toBe(true);
    });

    it('should return true for Response with 302 status', () => {
      const response = new Response(null, { status: 302 });
      expect(isRedirectResponse(response)).toBe(true);
    });

    it('should return true for Response with 303 status', () => {
      const response = new Response(null, { status: 303 });
      expect(isRedirectResponse(response)).toBe(true);
    });

    it('should return true for Response with 307 status', () => {
      const response = new Response(null, { status: 307 });
      expect(isRedirectResponse(response)).toBe(true);
    });

    it('should return true for Response with 308 status', () => {
      const response = new Response(null, { status: 308 });
      expect(isRedirectResponse(response)).toBe(true);
    });

    it('should return false for Response with 200 status', () => {
      const response = new Response(null, { status: 200 });
      expect(isRedirectResponse(response)).toBe(false);
    });

    it('should return false for Response with 404 status', () => {
      const response = new Response(null, { status: 404 });
      expect(isRedirectResponse(response)).toBe(false);
    });

    it('should return false for Response with 500 status', () => {
      const response = new Response(null, { status: 500 });
      expect(isRedirectResponse(response)).toBe(false);
    });

    it('should return true for object with redirect type', () => {
      const error = { type: 'redirect', url: '/new-path' };
      expect(isRedirectResponse(error)).toBe(true);
    });

    it('should return true for object with status in 3xx range', () => {
      const error = { status: 302, location: '/new-path' };
      expect(isRedirectResponse(error)).toBe(true);
    });

    it('should return true for object with statusCode in 3xx range', () => {
      const error = { statusCode: 307, location: '/new-path' };
      expect(isRedirectResponse(error)).toBe(true);
    });

    it('should return false for null', () => {
      expect(isRedirectResponse(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isRedirectResponse(undefined)).toBe(false);
    });

    it('should return false for primitive values', () => {
      expect(isRedirectResponse('error')).toBe(false);
      expect(isRedirectResponse(42)).toBe(false);
      expect(isRedirectResponse(true)).toBe(false);
    });

    it('should return false for Error objects', () => {
      expect(isRedirectResponse(new Error('test'))).toBe(false);
    });
  });

  describe('isNotFoundResponse', () => {
    it('should return true for Response with 404 status', () => {
      const response = new Response(null, { status: 404 });
      expect(isNotFoundResponse(response)).toBe(true);
    });

    it('should return false for Response with 200 status', () => {
      const response = new Response(null, { status: 200 });
      expect(isNotFoundResponse(response)).toBe(false);
    });

    it('should return false for Response with 500 status', () => {
      const response = new Response(null, { status: 500 });
      expect(isNotFoundResponse(response)).toBe(false);
    });

    it('should return false for Response with 302 status', () => {
      const response = new Response(null, { status: 302 });
      expect(isNotFoundResponse(response)).toBe(false);
    });

    it('should return true for object with not-found type', () => {
      const error = { type: 'not-found' };
      expect(isNotFoundResponse(error)).toBe(true);
    });

    it('should return true for object with notFound type', () => {
      const error = { type: 'notFound' };
      expect(isNotFoundResponse(error)).toBe(true);
    });

    it('should return true for object with status 404', () => {
      const error = { status: 404 };
      expect(isNotFoundResponse(error)).toBe(true);
    });

    it('should return true for object with statusCode 404', () => {
      const error = { statusCode: 404 };
      expect(isNotFoundResponse(error)).toBe(true);
    });

    it('should return false for null', () => {
      expect(isNotFoundResponse(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isNotFoundResponse(undefined)).toBe(false);
    });

    it('should return false for primitive values', () => {
      expect(isNotFoundResponse('error')).toBe(false);
      expect(isNotFoundResponse(42)).toBe(false);
    });
  });

  describe('safeFlushServerless', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should call the flush function', async () => {
      const mockFlush = vi.fn().mockResolvedValue(undefined);

      safeFlushServerless(mockFlush);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockFlush).toHaveBeenCalled();
    });

    it('should not throw when flush succeeds', () => {
      const mockFlush = vi.fn().mockResolvedValue(undefined);

      expect(() => safeFlushServerless(mockFlush)).not.toThrow();
    });

    it('should not throw when flush fails', async () => {
      const mockFlush = vi.fn().mockRejectedValue(new Error('Flush failed'));

      expect(() => safeFlushServerless(mockFlush)).not.toThrow();

      await new Promise(resolve => setTimeout(resolve, 0));
    });

    it('should handle flush rejection gracefully', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const mockFlush = vi.fn().mockRejectedValue(new Error('Network error'));

      safeFlushServerless(mockFlush);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockFlush).toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });
  });
});
