import { HTTP_ROUTE } from '@sentry/conventions/attributes';
import type { ErrorContext } from 'elysia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Capture handlers registered by withElysia
let onAfterHandleHandler: (context: unknown) => void;
let onErrorHandler: (context: unknown) => void;
let traceHandler: (lifecycle: unknown) => void;

function createMockApp() {
  const app: Record<string, unknown> = {};
  app.use = vi.fn().mockReturnValue(app);
  app.wrap = vi.fn().mockReturnValue(app);
  app.trace = vi.fn((_opts: unknown, handler: (lifecycle: unknown) => void) => {
    traceHandler = handler;
    return app;
  });
  app.onRequest = vi.fn(() => app);
  app.onAfterHandle = vi.fn((_opts: unknown, handler: (context: unknown) => void) => {
    onAfterHandleHandler = handler;
    return app;
  });
  app.onError = vi.fn((_opts: unknown, handler: (context: unknown) => void) => {
    onErrorHandler = handler;
    return app;
  });
  return app;
}

let mockApp: ReturnType<typeof createMockApp>;

const mockCaptureException = vi.fn();
const mockGetIsolationScope = vi.fn(() => ({
  setSDKProcessingMetadata: vi.fn(),
  setTransactionName: vi.fn(),
}));
let traceLifecycle: 'static' | 'stream' = 'stream';
const mockGetClient = vi.fn(() => ({
  on: vi.fn(),
  getOptions: () => ({ traceLifecycle }),
}));
const startedSpans: { name: string; attributes?: Record<string, unknown> }[] = [];
const mockStartInactiveSpan = vi.fn((options: { name: string; attributes?: Record<string, unknown> }) => {
  startedSpans.push({ name: options.name, attributes: options.attributes });
  return { end: vi.fn() };
});
const mockRootSpan = {
  setAttribute: vi.fn(),
  setAttributes: vi.fn(),
  updateName: vi.fn(),
};
const mockGetActiveSpan = vi.fn();
const mockGetRootSpan = vi.fn(() => mockRootSpan);
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
    getActiveSpan: () => mockGetActiveSpan(),
    getIsolationScope: () => mockGetIsolationScope(),
    getClient: () => mockGetClient(),
    getRootSpan: () => mockGetRootSpan(),
    getTraceData: () => mockGetTraceData(),
    startInactiveSpan: (options: { name: string; attributes?: Record<string, unknown> }) =>
      mockStartInactiveSpan(options),
  };
});

// @ts-expect-error - dynamic import after mocks
const { withElysia } = await import('../src/withElysia');

describe('withElysia', () => {
  beforeEach(() => {
    mockApp = createMockApp();
    startedSpans.length = 0;
    traceLifecycle = 'stream';
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('registers .wrap(), .trace(), and lifecycle hooks', () => {
    // @ts-expect-error - mock app
    withElysia(mockApp);
    expect(mockApp.wrap).toHaveBeenCalledWith(expect.any(Function));
    expect(mockApp.trace).toHaveBeenCalledWith({ as: 'global' }, expect.any(Function));
    expect(mockApp.onRequest).toHaveBeenCalled();
    expect(mockApp.onAfterHandle).toHaveBeenCalledWith({ as: 'global' }, expect.any(Function));
    expect(mockApp.onError).toHaveBeenCalledWith({ as: 'global' }, expect.any(Function));
  });

  it('returns the app instance for chaining', () => {
    // @ts-expect-error - mock app
    const result = withElysia(mockApp);
    expect(result).toBe(mockApp);
  });

  describe('response trace headers', () => {
    it('injects sentry-trace and baggage into response headers', () => {
      // @ts-expect-error - mock app
      withElysia(mockApp);
      const headers: Record<string, string> = {};
      onAfterHandleHandler({ set: { headers } });

      expect(headers['sentry-trace']).toBe('abc123-def456-1');
      expect(headers['baggage']).toBe('sentry-environment=test,sentry-trace_id=abc123');
    });

    it('sets the matched route on the root span', () => {
      mockGetActiveSpan.mockReturnValueOnce(mockRootSpan);
      // @ts-expect-error - mock app
      withElysia(mockApp);

      onAfterHandleHandler({
        route: '/users/:id',
        request: new Request('https://example.com/users/42', { method: 'GET' }),
        set: { headers: {} },
      });

      expect(mockRootSpan.setAttributes).toHaveBeenCalledWith({
        'sentry.segment.name.source': 'route',
        [HTTP_ROUTE]: '/users/:id',
      });
    });

    it('does not set headers when trace data is empty', () => {
      mockGetTraceData.mockReturnValueOnce({});
      // @ts-expect-error - mock app
      withElysia(mockApp);
      const headers: Record<string, string> = {};
      onAfterHandleHandler({ set: { headers } });

      expect(headers['sentry-trace']).toBeUndefined();
      expect(headers['baggage']).toBeUndefined();
    });
  });

  describe('defaultShouldHandleError', () => {
    function triggerError(status: number | string | undefined): void {
      // @ts-expect-error - mock app
      withElysia(mockApp);
      onErrorHandler({
        route: '/test',
        request: { method: 'GET' },
        error: new Error('test'),
        set: { status },
      } as unknown as ErrorContext);
    }

    it('captures errors with status >= 500', () => {
      triggerError(500);
      expect(mockCaptureException).toHaveBeenCalled();
    });

    it('captures errors with status 503', () => {
      triggerError(503);
      expect(mockCaptureException).toHaveBeenCalled();
    });

    it('captures errors with undefined status', () => {
      triggerError(undefined);
      expect(mockCaptureException).toHaveBeenCalled();
    });

    it('captures errors with status <= 299 (unusual in error handler)', () => {
      triggerError(200);
      expect(mockCaptureException).toHaveBeenCalled();
    });

    it('does not capture 4xx errors', () => {
      triggerError(400);
      expect(mockCaptureException).not.toHaveBeenCalled();
    });

    it('does not capture 404 errors', () => {
      triggerError(404);
      expect(mockCaptureException).not.toHaveBeenCalled();
    });

    it('does not capture 3xx responses', () => {
      triggerError(302);
      expect(mockCaptureException).not.toHaveBeenCalled();
    });

    it('handles string status codes', () => {
      triggerError('500');
      expect(mockCaptureException).toHaveBeenCalled();
    });

    it('does not capture string 4xx status codes', () => {
      triggerError('400');
      expect(mockCaptureException).not.toHaveBeenCalled();
    });
  });

  describe('request handler span names', () => {
    /** Drive the registered trace handler through a single `Handle` phase. */
    function runHandlePhase(handlerNames: string[], route = '/users/:id'): void {
      traceHandler({
        context: { request: new Request('http://localhost/users/123'), route },
        onHandle: (callback: (process: unknown) => void) => {
          callback({
            total: handlerNames.length,
            onEvent: (onChild: (child: unknown) => void) => {
              for (const name of handlerNames) {
                onChild({ name, onStop: () => {} });
              }
            },
            onStop: () => {},
          });
        },
      });
    }

    it('names the spans after the route when span streaming is enabled', () => {
      // @ts-expect-error - mock app
      withElysia(mockApp);
      runHandlePhase(['getUser']);

      expect(startedSpans.map(span => span.name)).toEqual(['/users/:id', '/users/:id']);
    });

    it('uses the low cardinality fallback when the context carries no route', () => {
      // @ts-expect-error - mock app
      withElysia(mockApp);
      runHandlePhase(['getUser'], '');

      expect(startedSpans.map(span => span.name)).toEqual(['Request handler', 'Request handler']);
    });

    it('keeps the phase and handler names in static mode', () => {
      traceLifecycle = 'static';
      // @ts-expect-error - mock app
      withElysia(mockApp);
      runHandlePhase(['getUser']);

      expect(startedSpans.map(span => span.name)).toEqual(['Handle', 'getUser']);
    });

    it('records the route on the handler spans in both trace lifecycles', () => {
      // @ts-expect-error - mock app
      withElysia(mockApp);
      runHandlePhase(['getUser']);

      traceLifecycle = 'static';
      // @ts-expect-error - mock app
      withElysia(createMockApp());
      runHandlePhase(['getUser']);

      expect(startedSpans).toHaveLength(4);
      for (const span of startedSpans) {
        expect(span.attributes).toMatchObject({ 'http.route': '/users/:id' });
      }
    });

    it('records no route when the context carries none', () => {
      // @ts-expect-error - mock app
      withElysia(mockApp);
      runHandlePhase(['getUser'], '');

      expect(startedSpans[0]?.attributes).not.toHaveProperty('http.route');
      expect(startedSpans[1]?.attributes).not.toHaveProperty('http.route');
    });

    it('records no route on the spans of other lifecycle phases', () => {
      // @ts-expect-error - mock app
      withElysia(mockApp);
      traceHandler({
        context: { request: new Request('http://localhost/users/123'), route: '/users/:id' },
        onRequest: (callback: (process: unknown) => void) => {
          callback({ total: 0, onEvent: () => {}, onStop: () => {} });
        },
      });

      expect(startedSpans).toHaveLength(1);
      expect(startedSpans[0]?.attributes).toMatchObject({ 'sentry.op': 'middleware' });
      expect(startedSpans[0]?.attributes).not.toHaveProperty('http.route');
    });

    it('records the handler name on the handler child span in both trace lifecycles', () => {
      // @ts-expect-error - mock app
      withElysia(mockApp);
      runHandlePhase(['getUser']);

      traceLifecycle = 'static';
      // @ts-expect-error - mock app
      withElysia(createMockApp());
      runHandlePhase(['getUser']);

      expect(startedSpans[1]?.attributes).toMatchObject({ 'code.function.name': 'getUser' });
      expect(startedSpans[3]?.attributes).toMatchObject({ 'code.function.name': 'getUser' });
    });

    it('records no handler name for an anonymous handler', () => {
      // @ts-expect-error - mock app
      withElysia(mockApp);
      runHandlePhase(['']);

      expect(startedSpans[1]?.attributes).not.toHaveProperty('code.function.name');
    });
  });

  describe('custom shouldHandleError', () => {
    it('uses custom shouldHandleError when provided', () => {
      const customShouldHandle = vi.fn(() => false);
      // @ts-expect-error - mock app
      withElysia(mockApp, { shouldHandleError: customShouldHandle });

      onErrorHandler({
        route: '/test',
        request: { method: 'GET' },
        error: new Error('test'),
        set: { status: 500 },
      } as unknown as ErrorContext);

      expect(customShouldHandle).toHaveBeenCalled();
      expect(mockCaptureException).not.toHaveBeenCalled();
    });
  });
});
