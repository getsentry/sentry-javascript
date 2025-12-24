import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isErrorCaptured,
  isNotFoundResponse,
  isRedirectResponse,
  markErrorAsCaptured,
  safeFlushServerless,
} from '../../../src/server/rsc/responseUtils';

describe('responseUtils', () => {
  describe('isErrorCaptured / markErrorAsCaptured', () => {
    it('should return false for uncaptured errors', () => {
      const error = new Error('test');
      expect(isErrorCaptured(error)).toBe(false);
    });

    it('should return true for captured errors', () => {
      const error = new Error('test');
      markErrorAsCaptured(error);
      expect(isErrorCaptured(error)).toBe(true);
    });

    it('should handle null errors', () => {
      expect(isErrorCaptured(null)).toBe(false);
      // markErrorAsCaptured should not throw for null
      expect(() => markErrorAsCaptured(null)).not.toThrow();
    });

    it('should handle undefined errors', () => {
      expect(isErrorCaptured(undefined)).toBe(false);
      expect(() => markErrorAsCaptured(undefined)).not.toThrow();
    });

    it('should handle primitive errors (strings)', () => {
      // Primitives cannot be tracked by WeakSet
      const error = 'string error';
      markErrorAsCaptured(error);
      expect(isErrorCaptured(error)).toBe(false);
    });

    it('should handle primitive errors (numbers)', () => {
      const error = 42;
      markErrorAsCaptured(error);
      expect(isErrorCaptured(error)).toBe(false);
    });

    it('should track different error objects independently', () => {
      const error1 = new Error('error 1');
      const error2 = new Error('error 2');

      markErrorAsCaptured(error1);

      expect(isErrorCaptured(error1)).toBe(true);
      expect(isErrorCaptured(error2)).toBe(false);
    });

    it('should handle object errors', () => {
      const error = { message: 'custom error', code: 500 };
      markErrorAsCaptured(error);
      expect(isErrorCaptured(error)).toBe(true);
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

      // Wait for the promise to resolve
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

      // Wait for the promise to reject (should be caught internally)
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    it('should handle flush rejection gracefully', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const mockFlush = vi.fn().mockRejectedValue(new Error('Network error'));

      safeFlushServerless(mockFlush);

      // Wait for the promise to reject
      await new Promise(resolve => setTimeout(resolve, 0));

      // Should not throw, error is caught internally
      expect(mockFlush).toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });
  });
});
