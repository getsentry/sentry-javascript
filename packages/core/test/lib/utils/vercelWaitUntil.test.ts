import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { vercelWaitUntil } from '../../../src/utils/vercelWaitUntil';
import { GLOBAL_OBJ } from '../../../src/utils/worldwide';

describe('vercelWaitUntil', () => {
  const VERCEL_REQUEST_CONTEXT_SYMBOL = Symbol.for('@vercel/request-context');
  const globalWithEdgeRuntime = globalThis as typeof globalThis & { EdgeRuntime?: string };
  const globalWithVercelRequestContext = GLOBAL_OBJ as unknown as Record<symbol, unknown>;

  // `vercelWaitUntil` only runs in Vercel Edge runtime, which is detected via the global `EdgeRuntime` variable.
  // In tests we set it explicitly so the logic is actually exercised.
  const originalEdgeRuntime = globalWithEdgeRuntime.EdgeRuntime;

  beforeEach(() => {
    globalWithEdgeRuntime.EdgeRuntime = 'edge-runtime';
  });

  afterEach(() => {
    if (originalEdgeRuntime === undefined) {
      delete globalWithEdgeRuntime.EdgeRuntime;
    } else {
      globalWithEdgeRuntime.EdgeRuntime = originalEdgeRuntime;
    }
  });

  it('should do nothing if GLOBAL_OBJ does not have the @vercel/request-context symbol', () => {
    const task = Promise.resolve();
    vercelWaitUntil(task);
    // No assertions needed, just ensuring no errors are thrown
  });

  it('should do nothing if get method is not defined', () => {
    const originalRequestContext = globalWithVercelRequestContext[VERCEL_REQUEST_CONTEXT_SYMBOL];
    globalWithVercelRequestContext[VERCEL_REQUEST_CONTEXT_SYMBOL] = {};
    const task = Promise.resolve();
    vercelWaitUntil(task);
    // No assertions needed, just ensuring no errors are thrown
    globalWithVercelRequestContext[VERCEL_REQUEST_CONTEXT_SYMBOL] = originalRequestContext;
  });

  it('should do nothing if waitUntil method is not defined', () => {
    const originalRequestContext = globalWithVercelRequestContext[VERCEL_REQUEST_CONTEXT_SYMBOL];
    globalWithVercelRequestContext[VERCEL_REQUEST_CONTEXT_SYMBOL] = {
      get: () => ({}),
    };
    const task = Promise.resolve();
    vercelWaitUntil(task);
    // No assertions needed, just ensuring no errors are thrown
    globalWithVercelRequestContext[VERCEL_REQUEST_CONTEXT_SYMBOL] = originalRequestContext;
  });

  it('should call waitUntil method if it is defined', () => {
    const originalRequestContext = globalWithVercelRequestContext[VERCEL_REQUEST_CONTEXT_SYMBOL];
    const waitUntilMock = vi.fn();
    globalWithVercelRequestContext[VERCEL_REQUEST_CONTEXT_SYMBOL] = {
      get: () => ({ waitUntil: waitUntilMock }),
    };
    const task = Promise.resolve();
    vercelWaitUntil(task);
    expect(waitUntilMock).toHaveBeenCalledWith(task);
    globalWithVercelRequestContext[VERCEL_REQUEST_CONTEXT_SYMBOL] = originalRequestContext;
  });
});
