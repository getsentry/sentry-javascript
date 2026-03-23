import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock trace process for testing onPhaseEnd callbacks
function createMockTraceProcess(opts: { error?: Error | null } = {}) {
  let onStopCallback: ((detail: { end: number; error: Error | null; elapsed: number }) => void) | undefined;
  return {
    name: '',
    begin: 0,
    end: Promise.resolve(0),
    error: Promise.resolve(opts.error ?? null),
    total: 0,
    onEvent: vi.fn(),
    onStop: vi.fn((cb: (detail: { end: number; error: Error | null; elapsed: number }) => void) => {
      onStopCallback = cb;
      return Promise.resolve();
    }),
    triggerOnStop(error: Error | null = null) {
      onStopCallback?.({ end: 0, error, elapsed: 0 });
    },
  };
}

// Capture the .trace() handler so we can invoke it in tests
let traceHandler: (lifecycle: unknown) => void;

function createMockApp() {
  const app: Record<string, unknown> = {};
  app.use = vi.fn().mockReturnValue(app);
  app.wrap = vi.fn().mockReturnValue(app);
  app.trace = vi.fn((_opts: unknown, handler: (lifecycle: unknown) => void) => {
    traceHandler = handler;
    return app;
  });
  // These should NOT be called anymore
  app.onRequest = vi.fn(() => app);
  app.onAfterHandle = vi.fn(() => app);
  app.onError = vi.fn(() => app);
  return app;
}

let mockApp: ReturnType<typeof createMockApp>;

const mockCaptureException = vi.fn();
const mockGetIsolationScope = vi.fn(() => ({
  setSDKProcessingMetadata: vi.fn(),
  setTransactionName: vi.fn(),
}));
const mockGetClient = vi.fn(() => ({
  on: vi.fn(),
}));
const mockGetTraceData = vi.fn(() => ({
  'sentry-trace': 'abc123-def456-1',
  baggage: 'sentry-environment=test,sentry-trace_id=abc123',
}));

vi.mock('@sentry/core', async importActual => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = await importActual<typeof import('@sentry/core')>();
  return {
    ...actual,
    captureException: (...args: unknown[]) => mockCaptureException(...args),
    getIsolationScope: () => mockGetIsolationScope(),
    getClient: () => mockGetClient(),
    getTraceData: () => mockGetTraceData(),
  };
});

// @ts-expect-error - dynamic import after mocks
const { withElysia } = await import('../src/withElysia');

describe('withElysia', () => {
  beforeEach(() => {
    mockApp = createMockApp();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('registers .wrap() and .trace() but no lifecycle hooks', () => {
    // @ts-expect-error - mock app
    withElysia(mockApp);
    expect(mockApp.wrap).toHaveBeenCalledWith(expect.any(Function));
    expect(mockApp.trace).toHaveBeenCalledWith({ as: 'global' }, expect.any(Function));
    // Should NOT register lifecycle hooks — all logic is inside .trace()
    expect(mockApp.onRequest).not.toHaveBeenCalled();
    expect(mockApp.onAfterHandle).not.toHaveBeenCalled();
    expect(mockApp.onError).not.toHaveBeenCalled();
  });

  it('returns the app instance for chaining', () => {
    // @ts-expect-error - mock app
    const result = withElysia(mockApp);
    expect(result).toBe(mockApp);
  });

  describe('response trace headers (via .trace() onAfterHandle)', () => {
    function createLifecycleMock(contextOverrides = {}) {
      const afterHandleProcess = createMockTraceProcess();
      return {
        lifecycle: {
          context: {
            request: new Request('http://localhost/test'),
            route: '/test',
            set: {
              headers: {} as Record<string, string>,
              ...((contextOverrides as { set?: { status?: unknown } }).set && { status: undefined }),
            },
            ...contextOverrides,
          },
          onRequest: vi.fn(() => Promise.resolve()),
          onParse: vi.fn(() => Promise.resolve()),
          onTransform: vi.fn(() => Promise.resolve()),
          onBeforeHandle: vi.fn(() => Promise.resolve()),
          onHandle: vi.fn(() => Promise.resolve()),
          onAfterHandle: vi.fn((cb: (process: unknown) => void) => {
            cb(afterHandleProcess);
            return Promise.resolve();
          }),
          onMapResponse: vi.fn(() => Promise.resolve()),
          onAfterResponse: vi.fn(() => Promise.resolve()),
          onError: vi.fn(() => Promise.resolve()),
        },
        afterHandleProcess,
      };
    }

    it('injects sentry-trace and baggage into response headers', () => {
      // @ts-expect-error - mock app
      withElysia(mockApp);
      const { lifecycle, afterHandleProcess } = createLifecycleMock();
      traceHandler(lifecycle);
      afterHandleProcess.triggerOnStop();

      expect(lifecycle.context.set.headers['sentry-trace']).toBe('abc123-def456-1');
      expect(lifecycle.context.set.headers['baggage']).toBe('sentry-environment=test,sentry-trace_id=abc123');
    });

    it('does not set headers when trace data is empty', () => {
      mockGetTraceData.mockReturnValueOnce({});
      // @ts-expect-error - mock app
      withElysia(mockApp);
      const { lifecycle, afterHandleProcess } = createLifecycleMock();
      traceHandler(lifecycle);
      afterHandleProcess.triggerOnStop();

      expect(lifecycle.context.set.headers['sentry-trace']).toBeUndefined();
      expect(lifecycle.context.set.headers['baggage']).toBeUndefined();
    });
  });

  describe('error handling (via .trace() onError)', () => {
    function triggerErrorViaTrace(
      status: number | string | undefined,
      customShouldHandle?: (context: unknown) => boolean,
    ): void {
      const errorProcess = createMockTraceProcess();
      const mockLifecycle = {
        context: {
          request: new Request('http://localhost/test'),
          route: '/test',
          error: new Error('test'),
          set: { status, headers: {} },
        },
        onRequest: vi.fn(() => Promise.resolve()),
        onParse: vi.fn(() => Promise.resolve()),
        onTransform: vi.fn(() => Promise.resolve()),
        onBeforeHandle: vi.fn(() => Promise.resolve()),
        onHandle: vi.fn(() => Promise.resolve()),
        onAfterHandle: vi.fn(() => Promise.resolve()),
        onMapResponse: vi.fn(() => Promise.resolve()),
        onAfterResponse: vi.fn(() => Promise.resolve()),
        onError: vi.fn((cb: (process: unknown) => void) => {
          cb(errorProcess);
          return Promise.resolve();
        }),
      };

      // @ts-expect-error - mock app
      withElysia(mockApp, customShouldHandle ? { shouldHandleError: customShouldHandle } : {});
      traceHandler(mockLifecycle);
      errorProcess.triggerOnStop(new Error('test'));
    }

    it('captures errors with status >= 500', () => {
      triggerErrorViaTrace(500);
      expect(mockCaptureException).toHaveBeenCalled();
    });

    it('captures errors with status 503', () => {
      triggerErrorViaTrace(503);
      expect(mockCaptureException).toHaveBeenCalled();
    });

    it('captures errors with undefined status', () => {
      triggerErrorViaTrace(undefined);
      expect(mockCaptureException).toHaveBeenCalled();
    });

    it('captures errors with status <= 299 (unusual in error handler)', () => {
      triggerErrorViaTrace(200);
      expect(mockCaptureException).toHaveBeenCalled();
    });

    it('does not capture 4xx errors', () => {
      triggerErrorViaTrace(400);
      expect(mockCaptureException).not.toHaveBeenCalled();
    });

    it('does not capture 404 errors', () => {
      triggerErrorViaTrace(404);
      expect(mockCaptureException).not.toHaveBeenCalled();
    });

    it('does not capture 3xx responses', () => {
      triggerErrorViaTrace(302);
      expect(mockCaptureException).not.toHaveBeenCalled();
    });

    it('handles string status codes', () => {
      triggerErrorViaTrace('500');
      expect(mockCaptureException).toHaveBeenCalled();
    });

    it('does not capture string 4xx status codes', () => {
      triggerErrorViaTrace('400');
      expect(mockCaptureException).not.toHaveBeenCalled();
    });

    it('uses custom shouldHandleError when provided', () => {
      const customShouldHandle = vi.fn(() => false);
      triggerErrorViaTrace(500, customShouldHandle);

      expect(customShouldHandle).toHaveBeenCalled();
      expect(mockCaptureException).not.toHaveBeenCalled();
    });
  });
});
