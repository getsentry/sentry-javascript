import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import * as flushModule from '../../../src/exports';
import * as currentScopesModule from '../../../src/currentScopes';
import { getDefaultIsolationScope } from '../../../src/defaultScopes';
import { Scope } from '../../../src/scope';
import { flushIfServerless, setScopeFlushedByRuntime } from '../../../src/utils/flushIfServerless';
import * as vercelWaitUntilModule from '../../../src/utils/vercelWaitUntil';
import { GLOBAL_OBJ } from '../../../src/utils/worldwide';

describe('flushIfServerless', () => {
  let originalProcess: typeof process;

  beforeEach(() => {
    vi.resetAllMocks();
    originalProcess = global.process;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('should bind context (preserve `this`) when calling waitUntil from the Cloudflare execution context', async () => {
    const flushMock = vi.spyOn(flushModule, 'flush').mockResolvedValue(true);

    // Mock Cloudflare context with `waitUntil` (which should be called if `this` is bound correctly)
    const mockCloudflareCtx = {
      contextData: 'test-data',
      waitUntil: function (promise: Promise<unknown>) {
        // This will fail if 'this' is not bound correctly
        expect(this.contextData).toBe('test-data');
        return promise;
      },
    };

    const waitUntilSpy = vi.spyOn(mockCloudflareCtx, 'waitUntil');

    await flushIfServerless({ cloudflareCtx: mockCloudflareCtx });

    expect(waitUntilSpy).toHaveBeenCalledTimes(1);
    expect(flushMock).toHaveBeenCalledWith(2000);
  });

  test('should use cloudflare waitUntil when valid cloudflare context is provided', async () => {
    const flushMock = vi.spyOn(flushModule, 'flush').mockResolvedValue(true);
    const mockCloudflareCtx = {
      waitUntil: vi.fn(),
    };

    await flushIfServerless({ cloudflareCtx: mockCloudflareCtx, timeout: 5000 });

    expect(mockCloudflareCtx.waitUntil).toHaveBeenCalledTimes(1);
    expect(flushMock).toHaveBeenCalledWith(5000);
  });

  test('should use cloudflare waitUntil when Cloudflare `waitUntil` is provided', async () => {
    const flushMock = vi.spyOn(flushModule, 'flush').mockResolvedValue(true);
    const mockCloudflareCtx = {
      waitUntil: vi.fn(),
    };

    await flushIfServerless({ cloudflareWaitUntil: mockCloudflareCtx.waitUntil, timeout: 5000 });

    expect(mockCloudflareCtx.waitUntil).toHaveBeenCalledTimes(1);
    expect(flushMock).toHaveBeenCalledWith(5000);
  });

  test('should ignore cloudflare context when waitUntil is not a function (and use Vercel waitUntil instead)', async () => {
    const flushMock = vi.spyOn(flushModule, 'flush').mockResolvedValue(true);
    const vercelWaitUntilSpy = vi.spyOn(vercelWaitUntilModule, 'vercelWaitUntil').mockImplementation(() => {});

    // Mock Vercel environment
    // @ts-expect-error This is not typed
    GLOBAL_OBJ[Symbol.for('@vercel/request-context')] = { get: () => ({ waitUntil: vi.fn() }) };

    const mockCloudflareCtx = {
      waitUntil: 'not-a-function', // Invalid waitUntil
    };

    // @ts-expect-error Using the wrong type here on purpose
    await flushIfServerless({ cloudflareCtx: mockCloudflareCtx });

    expect(vercelWaitUntilSpy).toHaveBeenCalledTimes(1);
    expect(flushMock).toHaveBeenCalledWith(2000);
  });

  test('should handle multiple serverless environment variables simultaneously', async () => {
    const flushMock = vi.spyOn(flushModule, 'flush').mockResolvedValue(true);

    global.process = {
      ...originalProcess,
      env: {
        ...originalProcess.env,
        LAMBDA_TASK_ROOT: '/var/task',
        VERCEL: '1',
        NETLIFY: 'true',
        CF_PAGES: '1',
      },
    };

    await flushIfServerless({ timeout: 4000 });

    expect(flushMock).toHaveBeenCalledWith(4000);
  });

  test('should use default timeout when not specified', async () => {
    const flushMock = vi.spyOn(flushModule, 'flush').mockResolvedValue(true);
    const mockCloudflareCtx = {
      waitUntil: vi.fn(),
    };

    await flushIfServerless({ cloudflareCtx: mockCloudflareCtx });

    expect(flushMock).toHaveBeenCalledWith(2000);
  });

  test('should handle zero timeout value', async () => {
    const flushMock = vi.spyOn(flushModule, 'flush').mockResolvedValue(true);

    global.process = {
      ...originalProcess,
      env: {
        ...originalProcess.env,
        LAMBDA_TASK_ROOT: '/var/task',
      },
    };

    await flushIfServerless({ timeout: 0 });

    expect(flushMock).toHaveBeenCalledWith(0);
  });

  test('skips the flush for a request whose scope a runtime wrapper flushes', async () => {
    const flushMock = vi.spyOn(flushModule, 'flush').mockResolvedValue(true);
    const cloudflareWaitUntil = vi.fn();

    global.process = {
      ...originalProcess,
      env: {
        ...originalProcess.env,
        CF_PAGES: '1',
      },
    };

    // The default async context strategy never forks the isolation scope, so the request's scope is mocked.
    const requestScope = new Scope();
    setScopeFlushedByRuntime(requestScope);
    vi.spyOn(currentScopesModule, 'getIsolationScope').mockReturnValue(requestScope.clone());

    await flushIfServerless();
    await flushIfServerless({ cloudflareWaitUntil });

    expect(cloudflareWaitUntil).not.toHaveBeenCalled();
    expect(flushMock).not.toHaveBeenCalled();
  });

  test('does not mark the default isolation scope, which every request shares', async () => {
    const flushMock = vi.spyOn(flushModule, 'flush').mockResolvedValue(true);

    global.process = {
      ...originalProcess,
      env: {
        ...originalProcess.env,
        CF_PAGES: '1',
      },
    };

    setScopeFlushedByRuntime(getDefaultIsolationScope());
    await flushIfServerless();

    expect(flushMock).toHaveBeenCalledWith(2000);
  });
});
