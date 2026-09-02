import { GLOBAL_OBJ } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { waitUntil } from '../../../src/common/utils/responseEnd';

vi.mock('@sentry/core', async () => {
  const actual = await vi.importActual('@sentry/core');
  return {
    ...actual,
    debug: {
      log: vi.fn(),
    },
    flush: vi.fn(),
  };
});

const globalWithEdgeRuntime = globalThis as typeof globalThis & { EdgeRuntime?: string };

const CLOUDFLARE_CONTEXT_SYMBOL = Symbol.for('__cloudflare-context__');
const VERCEL_CONTEXT_SYMBOL = Symbol.for('@vercel/request-context');

function setVercelWaitUntil(): ReturnType<typeof vi.fn> {
  const vercelWaitUntilMock = vi.fn();
  (GLOBAL_OBJ as any)[VERCEL_CONTEXT_SYMBOL] = {
    get: () => ({ waitUntil: vercelWaitUntilMock }),
  };
  return vercelWaitUntilMock;
}

function setCloudflareWaitUntil(): ReturnType<typeof vi.fn> {
  const cfWaitUntilMock = vi.fn();
  (GLOBAL_OBJ as any)[CLOUDFLARE_CONTEXT_SYMBOL] = {
    ctx: { waitUntil: cfWaitUntilMock },
  };
  return cfWaitUntilMock;
}

describe('responseEnd utils', () => {
  const originalEdgeRuntime = globalWithEdgeRuntime.EdgeRuntime;

  beforeEach(() => {
    vi.clearAllMocks();
    // `vercelWaitUntil` only acts in the Vercel Edge runtime, detected via the `EdgeRuntime` global.
    globalWithEdgeRuntime.EdgeRuntime = 'edge-runtime';
    (GLOBAL_OBJ as any)[CLOUDFLARE_CONTEXT_SYMBOL] = undefined;
    (GLOBAL_OBJ as any)[VERCEL_CONTEXT_SYMBOL] = undefined;
  });

  afterEach(() => {
    if (originalEdgeRuntime === undefined) {
      delete globalWithEdgeRuntime.EdgeRuntime;
    } else {
      globalWithEdgeRuntime.EdgeRuntime = originalEdgeRuntime;
    }
  });

  describe('waitUntil', () => {
    it('should use cloudflareWaitUntil when Cloudflare context is available', () => {
      const cfWaitUntilMock = setCloudflareWaitUntil();
      const vercelWaitUntilMock = setVercelWaitUntil();

      const testTask = Promise.resolve('test');
      waitUntil(testTask);

      expect(cfWaitUntilMock).toHaveBeenCalledWith(testTask);
      expect(cfWaitUntilMock).toHaveBeenCalledTimes(1);
      // Should not use Vercel when Cloudflare is available
      expect(vercelWaitUntilMock).not.toHaveBeenCalled();
    });

    it('should use vercelWaitUntil when Cloudflare context is not available', () => {
      const vercelWaitUntilMock = setVercelWaitUntil();

      const testTask = Promise.resolve('test');
      waitUntil(testTask);

      expect(vercelWaitUntilMock).toHaveBeenCalledWith(testTask);
      expect(vercelWaitUntilMock).toHaveBeenCalledTimes(1);
    });

    it('should prefer Cloudflare over Vercel when both are available', () => {
      const cfWaitUntilMock = setCloudflareWaitUntil();
      const vercelWaitUntilMock = setVercelWaitUntil();

      const testTask = Promise.resolve('test');
      waitUntil(testTask);

      expect(cfWaitUntilMock).toHaveBeenCalledWith(testTask);
      expect(cfWaitUntilMock).toHaveBeenCalledTimes(1);
      expect(vercelWaitUntilMock).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully when waitUntil is called with a rejected promise', () => {
      const vercelWaitUntilMock = setVercelWaitUntil();
      const testTask = Promise.reject(new Error('test error'));

      // Should not throw synchronously
      expect(() => waitUntil(testTask)).not.toThrow();
      expect(vercelWaitUntilMock).toHaveBeenCalledWith(testTask);

      // Prevent unhandled rejection in test
      testTask.catch(() => {});
    });
  });
});
