import { GLOBAL_OBJ } from '@sentry/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { waitUntil } from '../../../src/common/utils/responseEnd';

vi.mock('@sentry/core', async () => {
  const actual = await vi.importActual('@sentry/core');
  return {
    ...actual,
    debug: {
      log: vi.fn(),
    },
    flush: vi.fn(),
    vercelWaitUntil: vi.fn(),
  };
});

describe('responseEnd utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear Cloudflare context
    const cfContextSymbol = Symbol.for('__cloudflare-context__');
    (GLOBAL_OBJ as any)[cfContextSymbol] = undefined;
    // Clear Vercel context
    const vercelContextSymbol = Symbol.for('@vercel/request-context');
    (GLOBAL_OBJ as any)[vercelContextSymbol] = undefined;
  });

  describe('waitUntil', () => {
    it('should use cloudflareWaitUntil when Cloudflare context is available', async () => {
      const cfContextSymbol = Symbol.for('__cloudflare-context__');
      const cfWaitUntilMock = vi.fn();
      (GLOBAL_OBJ as any)[cfContextSymbol] = {
        ctx: {
          waitUntil: cfWaitUntilMock,
        },
      };

      const testTask = Promise.resolve('test');
      waitUntil(testTask);

      expect(cfWaitUntilMock).toHaveBeenCalledWith(testTask);
      expect(cfWaitUntilMock).toHaveBeenCalledTimes(1);

      // Should not call vercelWaitUntil when Cloudflare is available
      const { vercelWaitUntil } = await import('@sentry/core');
      expect(vercelWaitUntil).not.toHaveBeenCalled();
    });

    it('should use vercelWaitUntil when Cloudflare context is not available', async () => {
      const { vercelWaitUntil } = await import('@sentry/core');
      const testTask = Promise.resolve('test');

      waitUntil(testTask);

      expect(vercelWaitUntil).toHaveBeenCalledWith(testTask);
      expect(vercelWaitUntil).toHaveBeenCalledTimes(1);
    });

    it('should prefer Cloudflare over Vercel when both are available', async () => {
      // Set up Cloudflare context
      const cfContextSymbol = Symbol.for('__cloudflare-context__');
      const cfWaitUntilMock = vi.fn();
      (GLOBAL_OBJ as any)[cfContextSymbol] = {
        ctx: {
          waitUntil: cfWaitUntilMock,
        },
      };

      // Set up Vercel context
      const vercelWaitUntilMock = vi.fn();
      (GLOBAL_OBJ as any)[Symbol.for('@vercel/request-context')] = {
        get: () => ({ waitUntil: vercelWaitUntilMock }),
      };

      const testTask = Promise.resolve('test');
      waitUntil(testTask);

      // Should use Cloudflare
      expect(cfWaitUntilMock).toHaveBeenCalledWith(testTask);
      expect(cfWaitUntilMock).toHaveBeenCalledTimes(1);

      // Should not use Vercel
      const { vercelWaitUntil } = await import('@sentry/core');
      expect(vercelWaitUntil).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully when waitUntil is called with a rejected promise', async () => {
      const { vercelWaitUntil } = await import('@sentry/core');
      const testTask = Promise.reject(new Error('test error'));

      // Should not throw synchronously
      expect(() => waitUntil(testTask)).not.toThrow();
      expect(vercelWaitUntil).toHaveBeenCalledWith(testTask);

      // Prevent unhandled rejection in test
      testTask.catch(() => {});
    });
  });
});
