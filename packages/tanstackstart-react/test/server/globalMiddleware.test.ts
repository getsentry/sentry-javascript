import { afterEach, describe, expect, it, vi } from 'vitest';

const captureExceptionSpy = vi.fn();
const startSpanSpy = vi.fn((_: unknown, callback: () => unknown) => callback());
// Span streaming is the default trace lifecycle; `undefined` stands for a not-yet-initialized SDK.
const getClientSpy = vi.fn<() => { getOptions: () => { traceLifecycle: string } } | undefined>(() => undefined);

vi.mock('@sentry/core', async importOriginal => {
  const original = await importOriginal();
  return {
    ...original,
    captureException: (...args: unknown[]) => captureExceptionSpy(...args),
    getClient: () => getClientSpy(),
    startSpan: (options: unknown, callback: () => unknown) => startSpanSpy(options, callback),
  };
});

// Import after mocks are set up
const { sentryGlobalRequestMiddleware, sentryGlobalFunctionMiddleware } =
  await import('../../src/server/globalMiddleware');

describe('sentryGlobalRequestMiddleware', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('captures error with correct mechanism when next() throws', async () => {
    const error = new Error('test error');
    const next = vi.fn().mockRejectedValue(error);

    const serverFn = sentryGlobalRequestMiddleware.options.server!;

    await expect(serverFn({ next })).rejects.toThrow('test error');

    expect(captureExceptionSpy).toHaveBeenCalledWith(error, {
      mechanism: { type: 'auto.middleware.tanstackstart.request', handled: false },
    });
  });

  it('does not capture error when next() succeeds', async () => {
    const next = vi.fn().mockResolvedValue('success');

    const serverFn = sentryGlobalRequestMiddleware.options.server!;
    const result = await serverFn({ next });

    expect(result).toBe('success');
    expect(captureExceptionSpy).not.toHaveBeenCalled();
  });

  it('has __SENTRY_INTERNAL__ flag set', () => {
    expect((sentryGlobalRequestMiddleware as unknown as Record<string, unknown>)['__SENTRY_INTERNAL__']).toBe(true);
  });
});

describe('sentryGlobalFunctionMiddleware', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('captures error with correct mechanism when next() throws', async () => {
    const error = new Error('test error');
    const next = vi.fn().mockRejectedValue(error);

    const serverFn = sentryGlobalFunctionMiddleware.options.server!;

    await expect(serverFn({ next })).rejects.toThrow('test error');

    expect(captureExceptionSpy).toHaveBeenCalledWith(error, {
      mechanism: { type: 'auto.middleware.tanstackstart.server_function', handled: false },
    });
  });

  it('has __SENTRY_INTERNAL__ flag set', () => {
    expect((sentryGlobalFunctionMiddleware as unknown as Record<string, unknown>)['__SENTRY_INTERNAL__']).toBe(true);
  });

  describe('server function span', () => {
    afterEach(() => {
      getClientSpy.mockReturnValue(undefined);
    });

    it('names the span after the server function with span streaming', async () => {
      getClientSpy.mockReturnValue({ getOptions: () => ({ traceLifecycle: 'stream' }) });
      const next = vi.fn().mockResolvedValue('ok');

      const serverFn = sentryGlobalFunctionMiddleware.options.server!;
      const result = await serverFn({
        next,
        method: 'POST',
        serverFnMeta: { name: 'testLog', id: 'abc123', filename: 'src/routes/test.tsx' },
      });

      expect(result).toBe('ok');
      expect(next).toHaveBeenCalledTimes(1);
      expect(startSpanSpy).toHaveBeenCalledWith(
        {
          name: 'testLog',
          attributes: {
            'sentry.origin': 'auto.function.tanstackstart.server',
            'sentry.op': 'function',
            'code.function.name': 'testLog',
            'http.request.method': 'POST',
            'sentry.description': 'POST /_serverFn/testLog',
            'tanstackstart.function.id': 'abc123',
            'tanstackstart.function.filename': 'src/routes/test.tsx',
          },
        },
        expect.any(Function),
      );
    });

    it('keeps the request path in the span name without span streaming', async () => {
      getClientSpy.mockReturnValue({ getOptions: () => ({ traceLifecycle: 'static' }) });

      const serverFn = sentryGlobalFunctionMiddleware.options.server!;
      await serverFn({ next: vi.fn().mockResolvedValue('ok'), method: 'GET', serverFnMeta: { name: 'testLog' } });

      // The resolved function name is useful in both lifecycles; only the description is a streaming workaround.
      expect(startSpanSpy).toHaveBeenCalledWith(
        {
          name: 'GET /_serverFn/testLog',
          attributes: {
            'sentry.origin': 'auto.function.tanstackstart.server',
            'sentry.op': 'function',
            'code.function.name': 'testLog',
            'http.request.method': 'GET',
          },
        },
        expect.any(Function),
      );
    });

    it('falls back to a generic name without server function metadata', async () => {
      getClientSpy.mockReturnValue({ getOptions: () => ({ traceLifecycle: 'stream' }) });

      const serverFn = sentryGlobalFunctionMiddleware.options.server!;
      await serverFn({ next: vi.fn().mockResolvedValue('ok') });

      expect(startSpanSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'serverFn',
          attributes: expect.objectContaining({ 'sentry.description': 'GET /_serverFn/serverFn' }),
        }),
        expect.any(Function),
      );
    });
  });
});
