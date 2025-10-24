import * as SentryCore from '@sentry/core';
import { H3Error } from 'h3';
import type { CapturedErrorContext } from 'nitropack/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sentryCaptureErrorHook } from '../../../src/runtime/hooks/captureErrorHook';

vi.mock('@sentry/core', async importOriginal => {
  const mod = await importOriginal();
  return {
    ...(mod as any),
    captureException: vi.fn(),
    flushIfServerless: vi.fn(),
    getClient: vi.fn(),
    getCurrentScope: vi.fn(() => ({
      setTransactionName: vi.fn(),
    })),
  };
});

vi.mock('../../../src/runtime/utils', () => ({
  extractErrorContext: vi.fn(() => ({ test: 'context' })),
}));

describe('sentryCaptureErrorHook', () => {
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
    (SentryCore.flushIfServerless as any).mockResolvedValue(undefined);
  });

  it('should capture regular errors', async () => {
    const error = new Error('Test error');

    await sentryCaptureErrorHook(error, mockErrorContext);

    expect(SentryCore.captureException).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        mechanism: { handled: false, type: 'auto.function.nuxt.nitro' },
      }),
    );
  });

  it('should skip H3Error with 4xx status codes', async () => {
    const error = new H3Error('Not found');
    error.statusCode = 404;

    await sentryCaptureErrorHook(error, mockErrorContext);

    expect(SentryCore.captureException).not.toHaveBeenCalled();
  });

  it('should skip H3Error with 3xx status codes', async () => {
    const error = new H3Error('Redirect');
    error.statusCode = 302;

    await sentryCaptureErrorHook(error, mockErrorContext);

    expect(SentryCore.captureException).not.toHaveBeenCalled();
  });

  it('should capture H3Error with 5xx status codes', async () => {
    const error = new H3Error('Server error');
    error.statusCode = 500;

    await sentryCaptureErrorHook(error, mockErrorContext);

    expect(SentryCore.captureException).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        mechanism: { handled: false, type: 'auto.function.nuxt.nitro' },
      }),
    );
  });

  it('should skip H3Error when cause has __sentry_captured__ flag', async () => {
    const originalError = new Error('Original error');
    // Mark the original error as already captured by middleware
    Object.defineProperty(originalError, '__sentry_captured__', {
      value: true,
      enumerable: false,
    });

    const h3Error = new H3Error('Wrapped error', { cause: originalError });
    h3Error.statusCode = 500;

    await sentryCaptureErrorHook(h3Error, mockErrorContext);

    expect(SentryCore.captureException).not.toHaveBeenCalled();
  });

  it('should capture H3Error when cause does not have __sentry_captured__ flag', async () => {
    const originalError = new Error('Original error');
    const h3Error = new H3Error('Wrapped error', { cause: originalError });
    h3Error.statusCode = 500;

    await sentryCaptureErrorHook(h3Error, mockErrorContext);

    expect(SentryCore.captureException).toHaveBeenCalledWith(
      h3Error,
      expect.objectContaining({
        mechanism: { handled: false, type: 'auto.function.nuxt.nitro' },
      }),
    );
  });

  it('should capture H3Error when cause is not an object', async () => {
    const h3Error = new H3Error('Error with string cause', { cause: 'string cause' });
    h3Error.statusCode = 500;

    await sentryCaptureErrorHook(h3Error, mockErrorContext);

    expect(SentryCore.captureException).toHaveBeenCalledWith(
      h3Error,
      expect.objectContaining({
        mechanism: { handled: false, type: 'auto.function.nuxt.nitro' },
      }),
    );
  });

  it('should capture H3Error when there is no cause', async () => {
    const h3Error = new H3Error('Error without cause');
    h3Error.statusCode = 500;

    await sentryCaptureErrorHook(h3Error, mockErrorContext);

    expect(SentryCore.captureException).toHaveBeenCalledWith(
      h3Error,
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

    await sentryCaptureErrorHook(error, mockErrorContext);

    expect(SentryCore.captureException).not.toHaveBeenCalled();
  });
});
