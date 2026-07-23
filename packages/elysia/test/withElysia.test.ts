import { HTTP_ROUTE } from '@sentry/conventions/attributes';
import type { ErrorContext } from 'elysia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Capture handlers registered by withElysia
let onAfterHandleHandler: (context: unknown) => void;
let onErrorHandler: (context: unknown) => void;

function createMockApp() {
  const app: Record<string, unknown> = {};
  app.use = vi.fn().mockReturnValue(app);
  app.wrap = vi.fn().mockReturnValue(app);
  app.trace = vi.fn().mockReturnValue(app);
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
const mockGetClient = vi.fn(() => ({
  on: vi.fn(),
}));
const mockRootSpan = {
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
        'sentry.source': 'route',
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
