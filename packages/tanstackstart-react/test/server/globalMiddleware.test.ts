import { afterEach, describe, expect, it, vi } from 'vitest';

const captureExceptionSpy = vi.fn();
const updateSpanNameSpy = vi.fn();
const getActiveSpanSpy = vi.fn<() => unknown>(() => undefined);
const spanToJSONSpy = vi.fn<() => { name: string; attributes: Record<string, unknown> }>();
// Span streaming is the default trace lifecycle; `undefined` stands for a not-yet-initialized SDK.
const getClientSpy = vi.fn<() => { getOptions: () => { traceLifecycle: string } } | undefined>(() => undefined);

vi.mock('@sentry/core', async importOriginal => {
  const original = await importOriginal();
  return {
    ...original,
    captureException: (...args: unknown[]) => captureExceptionSpy(...args),
    getActiveSpan: () => getActiveSpanSpy(),
    getClient: () => getClientSpy(),
    spanToJSON: () => spanToJSONSpy(),
    updateSpanName: (...args: unknown[]) => updateSpanNameSpy(...args),
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

  describe('server function span naming', () => {
    const setUpActiveSpan = (): { setAttribute: ReturnType<typeof vi.fn>; setAttributes: ReturnType<typeof vi.fn> } => {
      const span = { setAttribute: vi.fn(), setAttributes: vi.fn() };
      getActiveSpanSpy.mockReturnValue(span);
      spanToJSONSpy.mockReturnValue({
        name: 'GET /_serverFn/abc123',
        attributes: { 'sentry.origin': 'auto.function.tanstackstart.server', 'http.request.method': 'GET' },
      });
      return span;
    };

    afterEach(() => {
      getActiveSpanSpy.mockReturnValue(undefined);
      getClientSpy.mockReturnValue(undefined);
    });

    it('names the span after the server function with span streaming', async () => {
      const span = setUpActiveSpan();
      getClientSpy.mockReturnValue({ getOptions: () => ({ traceLifecycle: 'stream' }) });

      const serverFn = sentryGlobalFunctionMiddleware.options.server!;
      await serverFn({ next: vi.fn().mockResolvedValue('ok'), serverFnMeta: { name: 'testLog' } });

      expect(updateSpanNameSpy).toHaveBeenCalledWith(span, 'testLog');
      expect(span.setAttributes).toHaveBeenCalledWith({
        'code.function.name': 'testLog',
        'sentry.description': 'GET /_serverFn/testLog',
      });
    });

    it('keeps the request path in the span name without span streaming', async () => {
      const span = setUpActiveSpan();
      getClientSpy.mockReturnValue({ getOptions: () => ({ traceLifecycle: 'static' }) });

      const serverFn = sentryGlobalFunctionMiddleware.options.server!;
      await serverFn({ next: vi.fn().mockResolvedValue('ok'), serverFnMeta: { name: 'testLog' } });

      expect(updateSpanNameSpy).toHaveBeenCalledWith(span, 'GET /_serverFn/testLog');
      expect(span.setAttributes).not.toHaveBeenCalled();
    });
  });
});
