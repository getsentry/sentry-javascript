import * as SentryCore from '@sentry/core';
import * as SentryCoreServer from '@sentry/core/server';
import { H3Error } from 'h3';
import { HTTPError } from 'nitro/h3';
import type { CapturedErrorContext } from 'nitropack/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sentryCaptureErrorHook } from '../../../src/runtime/hooks/captureErrorHook';
import { sentryCaptureErrorHook as sentryCaptureErrorHookLegacy } from '../../../src/runtime/hooks/captureErrorHook-legacy';

vi.mock('@sentry/core', async importOriginal => {
  const mod = await importOriginal();
  return {
    ...(mod as any),
    captureException: vi.fn(),
    getClient: vi.fn(),
    getCurrentScope: vi.fn(() => ({
      setTransactionName: vi.fn(),
    })),
  };
});

vi.mock('@sentry/core/server', async importOriginal => {
  const mod = await importOriginal();
  return {
    ...(mod as any),
    flushIfServerless: vi.fn(),
  };
});

vi.mock('../../../src/runtime/utils', () => ({
  extractErrorContext: vi.fn(() => ({ test: 'context' })),
}));

// Each Nitro major throws its own HTTP error class, with its own status field, so both hooks are
// exercised against the error shape they will actually see.
const variants = [
  {
    name: 'Nitro v3 (h3 v2)',
    hook: sentryCaptureErrorHook,
    httpError: (message: string, status: number): Error => new HTTPError({ message, status }),
  },
  {
    name: 'Nitro v2 (h3 v1)',
    hook: sentryCaptureErrorHookLegacy,
    httpError: (message: string, status: number): Error => {
      const error = new H3Error(message);
      error.statusCode = status;
      return error;
    },
  },
];

// The two classes disagree on what the constructor puts on `cause` (h3 v2 stores the whole details
// object), so it is set directly: what is under test is how the hook reads `cause`, not h3.
function withCause(error: Error, cause: unknown): Error {
  return Object.defineProperty(error, 'cause', { value: cause, configurable: true });
}

describe.each(variants)('sentryCaptureErrorHook - $name', ({ hook, httpError }) => {
  const mockErrorContext: CapturedErrorContext = {
    event: {
      _method: 'GET',
      _path: '/test-path',
    } as any,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (SentryCore.getClient as any).mockReturnValue({
      getOptions: () => ({}),
    });
    (SentryCoreServer.flushIfServerless as any).mockResolvedValue(undefined);
  });

  it('should capture regular errors', async () => {
    const error = new Error('Test error');

    await hook(error, mockErrorContext);

    expect(SentryCore.captureException).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        mechanism: { handled: false, type: 'auto.function.nuxt.nitro' },
      }),
    );
  });

  it('should skip HTTP errors with 4xx status codes', async () => {
    const error = httpError('Not found', 404);

    await hook(error, mockErrorContext);

    expect(SentryCore.captureException).not.toHaveBeenCalled();
  });

  it('should skip HTTP errors with 3xx status codes', async () => {
    const error = httpError('Redirect', 302);

    await hook(error, mockErrorContext);

    expect(SentryCore.captureException).not.toHaveBeenCalled();
  });

  it('should capture HTTP errors with 5xx status codes', async () => {
    const error = httpError('Server error', 500);

    await hook(error, mockErrorContext);

    expect(SentryCore.captureException).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        mechanism: { handled: false, type: 'auto.function.nuxt.nitro' },
      }),
    );
  });

  it('should skip HTTP errors when cause has __sentry_captured__ flag', async () => {
    const originalError = new Error('Original error');
    // Mark the original error as already captured by middleware
    Object.defineProperty(originalError, '__sentry_captured__', {
      value: true,
      enumerable: false,
    });

    const error = withCause(httpError('Wrapped error', 500), originalError);

    await hook(error, mockErrorContext);

    expect(SentryCore.captureException).not.toHaveBeenCalled();
  });

  it('should capture HTTP errors when cause does not have __sentry_captured__ flag', async () => {
    const originalError = new Error('Original error');
    const error = withCause(httpError('Wrapped error', 500), originalError);

    await hook(error, mockErrorContext);

    expect(SentryCore.captureException).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        mechanism: { handled: false, type: 'auto.function.nuxt.nitro' },
      }),
    );
  });

  it('should capture HTTP errors when cause is not an object', async () => {
    const error = withCause(httpError('Error with string cause', 500), 'string cause');

    await hook(error, mockErrorContext);

    expect(SentryCore.captureException).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        mechanism: { handled: false, type: 'auto.function.nuxt.nitro' },
      }),
    );
  });

  it('should capture HTTP errors when there is no cause', async () => {
    const error = httpError('Error without cause', 500);

    await hook(error, mockErrorContext);

    expect(SentryCore.captureException).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        mechanism: { handled: false, type: 'auto.function.nuxt.nitro' },
      }),
    );
  });

  it('should skip when enableNitroErrorHandler is false', async () => {
    (SentryCore.getClient as any).mockReturnValue({
      getOptions: () => ({ enableNitroErrorHandler: false }),
    });

    const error = new Error('Test error');

    await hook(error, mockErrorContext);

    expect(SentryCore.captureException).not.toHaveBeenCalled();
  });
});
