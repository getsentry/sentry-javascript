import * as SentryCore from '@sentry/core';
import { HTTPError } from 'h3';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { captureErrorHook } from '../../../src/runtime/hooks/captureErrorHook';

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

describe('captureErrorHook', () => {
  const mockErrorContext = {
    event: {
      req: { method: 'GET', url: 'http://localhost/test-path' },
    },
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

    await captureErrorHook(error, mockErrorContext);

    expect(SentryCore.captureException).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        mechanism: { handled: false, type: 'auto.function.nitro' },
      }),
    );
  });

  it('should include structured context with method and path', async () => {
    const error = new Error('Test error');

    await captureErrorHook(error, mockErrorContext);

    expect(SentryCore.captureException).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        captureContext: {
          contexts: {
            nitro: { method: 'GET', path: '/test-path' },
          },
        },
      }),
    );
  });

  it('should set transaction name from method and path', async () => {
    const mockSetTransactionName = vi.fn();
    (SentryCore.getCurrentScope as any).mockReturnValue({
      setTransactionName: mockSetTransactionName,
    });

    const error = new Error('Test error');

    await captureErrorHook(error, mockErrorContext);

    expect(mockSetTransactionName).toHaveBeenCalledWith('GET /test-path');
  });

  it('should skip HTTPError with 4xx status codes', async () => {
    const error = new HTTPError({ status: 404, message: 'Not found' });

    await captureErrorHook(error, mockErrorContext);

    expect(SentryCore.captureException).not.toHaveBeenCalled();
  });

  it('should skip HTTPError with 3xx status codes', async () => {
    const error = new HTTPError({ status: 302, message: 'Redirect' });

    await captureErrorHook(error, mockErrorContext);

    expect(SentryCore.captureException).not.toHaveBeenCalled();
  });

  it('should capture HTTPError with 5xx status codes', async () => {
    const error = new HTTPError({ status: 500, message: 'Server error' });

    await captureErrorHook(error, mockErrorContext);

    expect(SentryCore.captureException).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        mechanism: { handled: false, type: 'auto.function.nitro' },
      }),
    );
  });

  it('should skip when enableNitroErrorHandler is false', async () => {
    (SentryCore.getClient as any).mockReturnValue({
      getOptions: () => ({ enableNitroErrorHandler: false }),
    });

    const error = new Error('Test error');

    await captureErrorHook(error, mockErrorContext);

    expect(SentryCore.captureException).not.toHaveBeenCalled();
  });

  it('should call flushIfServerless after capturing', async () => {
    const error = new Error('Test error');

    await captureErrorHook(error, mockErrorContext);

    expect(SentryCore.flushIfServerless).toHaveBeenCalled();
  });

  it('should handle missing event in error context', async () => {
    const error = new Error('Test error');
    const contextWithoutEvent = {
      event: undefined,
    };

    await captureErrorHook(error, contextWithoutEvent);

    expect(SentryCore.captureException).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        captureContext: {
          contexts: {
            nitro: {},
          },
        },
      }),
    );
  });

  it('should include tags in structured context when available', async () => {
    const error = new Error('Test error');
    const contextWithTags = {
      event: {
        req: { method: 'POST', url: 'http://localhost/api/test' },
      } as any,
      tags: ['tag1', 'tag2'],
    };

    await captureErrorHook(error, contextWithTags);

    expect(SentryCore.captureException).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        captureContext: {
          contexts: {
            nitro: { method: 'POST', path: '/api/test', tags: ['tag1', 'tag2'] },
          },
        },
      }),
    );
  });
});
