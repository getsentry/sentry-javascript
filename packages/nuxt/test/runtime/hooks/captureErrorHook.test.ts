import * as SentryCore from '@sentry/core';
import * as SentryCoreServer from '@sentry/core/server';
import { H3Error } from 'h3';
import { HTTPError } from 'nitro/h3';
import type { CapturedErrorContext } from 'nitropack/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sentryCaptureErrorHook } from '../../../src/runtime/hooks/captureErrorHook';

const setTransactionName = vi.fn();

vi.mock('@sentry/core', async importOriginal => {
  const mod = await importOriginal();
  return {
    ...(mod as any),
    captureException: vi.fn(),
    getClient: vi.fn(),
    getCurrentScope: vi.fn(() => ({ setTransactionName })),
  };
});

vi.mock('@sentry/core/server', async importOriginal => {
  const mod = await importOriginal();
  return {
    ...(mod as any),
    flushIfServerless: vi.fn(),
  };
});

vi.mock('../../../src/runtime/utils', async importOriginal => ({
  ...(await importOriginal()),
  extractErrorContext: vi.fn(() => ({ test: 'context' })),
}));

// Nuxt 3/4 run Nitro v2 on h3 v1, Nuxt 5 runs Nitro v3 on h3 v2. The two majors differ in both the
// error class the hook sees and the shape of the event it reads the request from.
const h3Majors = [
  {
    name: 'h3 v1 (Nitro v2)',
    httpError: (message: string, statusCode: number): Error => {
      const error = new H3Error(message);
      error.statusCode = statusCode;
      return error;
    },
    event: { method: 'GET', path: '/test-path' },
  },
  {
    name: 'h3 v2 (Nitro v3)',
    httpError: (message: string, statusCode: number): Error => new HTTPError({ message, status: statusCode }),
    event: { req: new Request('http://localhost/test-path'), url: new URL('http://localhost/test-path') },
  },
];

// The two classes disagree on what the constructor puts on `cause` (h3 v2 stores the whole details
// object), so it is set directly: what is under test is how the hook reads `cause`, not h3.
function withCause(error: Error, cause: unknown): Error {
  return Object.defineProperty(error, 'cause', { value: cause, configurable: true });
}

describe.each(h3Majors)('sentryCaptureErrorHook - $name', ({ httpError, event }) => {
  const mockErrorContext = { event } as unknown as CapturedErrorContext;

  beforeEach(() => {
    vi.clearAllMocks();
    (SentryCore.getClient as any).mockReturnValue({
      getOptions: () => ({}),
    });
    (SentryCoreServer.flushIfServerless as any).mockResolvedValue(undefined);
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

  it('sets the transaction name from the request method and path', async () => {
    await sentryCaptureErrorHook(new Error('Test error'), mockErrorContext);

    expect(setTransactionName).toHaveBeenCalledWith('GET /test-path');
  });

  it('should skip HTTP errors with 4xx status codes', async () => {
    await sentryCaptureErrorHook(httpError('Not found', 404), mockErrorContext);

    expect(SentryCore.captureException).not.toHaveBeenCalled();
  });

  it('should skip HTTP errors with 3xx status codes', async () => {
    await sentryCaptureErrorHook(httpError('Redirect', 302), mockErrorContext);

    expect(SentryCore.captureException).not.toHaveBeenCalled();
  });

  it('should capture HTTP errors with 5xx status codes', async () => {
    const error = httpError('Server error', 500);

    await sentryCaptureErrorHook(error, mockErrorContext);

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

    await sentryCaptureErrorHook(withCause(httpError('Wrapped error', 500), originalError), mockErrorContext);

    expect(SentryCore.captureException).not.toHaveBeenCalled();
  });

  it('should capture HTTP errors when cause does not have __sentry_captured__ flag', async () => {
    const error = withCause(httpError('Wrapped error', 500), new Error('Original error'));

    await sentryCaptureErrorHook(error, mockErrorContext);

    expect(SentryCore.captureException).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        mechanism: { handled: false, type: 'auto.function.nuxt.nitro' },
      }),
    );
  });

  it('should capture HTTP errors when cause is not an object', async () => {
    const error = withCause(httpError('Error with string cause', 500), 'string cause');

    await sentryCaptureErrorHook(error, mockErrorContext);

    expect(SentryCore.captureException).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        mechanism: { handled: false, type: 'auto.function.nuxt.nitro' },
      }),
    );
  });

  it('should capture HTTP errors when there is no cause', async () => {
    const error = httpError('Error without cause', 500);

    await sentryCaptureErrorHook(error, mockErrorContext);

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

    await sentryCaptureErrorHook(new Error('Test error'), mockErrorContext);

    expect(SentryCore.captureException).not.toHaveBeenCalled();
  });
});

describe('sentryCaptureErrorHook - errors that only look like h3 errors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (SentryCore.getClient as any).mockReturnValue({ getOptions: () => ({}) });
  });

  it('still reports a plain error that carries a 4xx `statusCode`', async () => {
    const error = Object.assign(new Error('Upstream API returned 404'), { statusCode: 404 });

    await sentryCaptureErrorHook(error, {} as CapturedErrorContext);

    expect(SentryCore.captureException).toHaveBeenCalledWith(error, expect.anything());
  });
});
