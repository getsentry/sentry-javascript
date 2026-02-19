import * as otelApi from '@opentelemetry/api';
import * as core from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createSentryServerInstrumentation,
  isInstrumentationApiUsed,
} from '../../src/server/createServerInstrumentation';
import * as serverBuildModule from '../../src/server/serverBuild';

vi.mock('@sentry/core', async () => {
  const actual = await vi.importActual('@sentry/core');
  return {
    ...actual,
    startSpan: vi.fn(),
    captureException: vi.fn(),
    flushIfServerless: vi.fn(),
    getActiveSpan: vi.fn(),
    getRootSpan: vi.fn(),
    updateSpanName: vi.fn(),
    GLOBAL_OBJ: globalThis,
    SEMANTIC_ATTRIBUTE_SENTRY_OP: 'sentry.op',
    SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN: 'sentry.origin',
    SEMANTIC_ATTRIBUTE_SENTRY_SOURCE: 'sentry.source',
  };
});

vi.mock('../../src/server/serverBuild', () => ({
  getMiddlewareName: vi.fn(),
}));

vi.mock('@opentelemetry/api', async () => {
  const actual = await vi.importActual('@opentelemetry/api');
  return {
    ...actual,
    context: {
      active: vi.fn(() => ({
        getValue: vi.fn(),
        setValue: vi.fn(),
      })),
      with: vi.fn((ctx, fn) => fn()),
    },
    createContextKey: actual.createContextKey,
  };
});

describe('createSentryServerInstrumentation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset global flag
    delete (globalThis as any).__sentryReactRouterServerInstrumentationUsed;
  });

  afterEach(() => {
    delete (globalThis as any).__sentryReactRouterServerInstrumentationUsed;
  });

  it('should create a valid server instrumentation object', () => {
    const instrumentation = createSentryServerInstrumentation();

    expect(instrumentation).toBeDefined();
    expect(typeof instrumentation.handler).toBe('function');
    expect(typeof instrumentation.route).toBe('function');
  });

  it('should set the global flag when created', () => {
    expect((globalThis as any).__sentryReactRouterServerInstrumentationUsed).toBeUndefined();

    createSentryServerInstrumentation();

    expect((globalThis as any).__sentryReactRouterServerInstrumentationUsed).toBe(true);
  });

  it('should update root span with handler request attributes', async () => {
    const mockRequest = new Request('http://example.com/test-path');
    const mockHandleRequest = vi.fn().mockResolvedValue({ status: 'success', error: undefined });
    const mockInstrument = vi.fn();
    const mockSetAttributes = vi.fn();
    const mockRootSpan = { setAttributes: mockSetAttributes };

    (core.getActiveSpan as any).mockReturnValue({});
    (core.getRootSpan as any).mockReturnValue(mockRootSpan);

    const instrumentation = createSentryServerInstrumentation();
    instrumentation.handler?.({ instrument: mockInstrument });

    expect(mockInstrument).toHaveBeenCalled();
    const hooks = mockInstrument.mock.calls[0]![0];

    // Call the request hook with RequestHandlerInstrumentationInfo
    await hooks.request(mockHandleRequest, { request: mockRequest, context: undefined });

    // Should update the root span name and attributes
    expect(core.updateSpanName).toHaveBeenCalledWith(mockRootSpan, 'GET /test-path');
    expect(mockSetAttributes).toHaveBeenCalledWith({
      'sentry.op': 'http.server',
      'sentry.origin': 'auto.http.react_router.instrumentation_api',
      'sentry.source': 'url',
    });
    expect(mockHandleRequest).toHaveBeenCalled();
    expect(core.flushIfServerless).toHaveBeenCalled();
  });

  it('should create own root span when no active span exists', async () => {
    const mockRequest = new Request('http://example.com/api/users');
    const mockHandleRequest = vi.fn().mockResolvedValue({ status: 'success', error: undefined });
    const mockInstrument = vi.fn();

    // No active span exists
    (core.getActiveSpan as any).mockReturnValue(undefined);
    (core.startSpan as any).mockImplementation((_opts: any, fn: any) => fn());

    const instrumentation = createSentryServerInstrumentation();
    instrumentation.handler?.({ instrument: mockInstrument });

    const hooks = mockInstrument.mock.calls[0]![0];

    await hooks.request(mockHandleRequest, { request: mockRequest, context: undefined });

    // Should create a new root span with forceTransaction
    expect(core.startSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'GET /api/users',
        forceTransaction: true,
        attributes: expect.objectContaining({
          'sentry.op': 'http.server',
          'sentry.origin': 'auto.http.react_router.instrumentation_api',
          'sentry.source': 'url',
          'http.request.method': 'GET',
          'url.path': '/api/users',
          'url.full': 'http://example.com/api/users',
        }),
      }),
      expect.any(Function),
    );
    expect(mockHandleRequest).toHaveBeenCalled();
    expect(core.flushIfServerless).toHaveBeenCalled();
  });

  it('should capture errors and set span status when root span exists', async () => {
    const mockRequest = new Request('http://example.com/api/users');
    const mockError = new Error('Handler error');
    const mockHandleRequest = vi.fn().mockResolvedValue({ status: 'error', error: mockError });
    const mockInstrument = vi.fn();
    const mockSetStatus = vi.fn();
    const mockRootSpan = { setAttributes: vi.fn(), setStatus: mockSetStatus };

    (core.getActiveSpan as any).mockReturnValue({});
    (core.getRootSpan as any).mockReturnValue(mockRootSpan);

    const instrumentation = createSentryServerInstrumentation();
    instrumentation.handler?.({ instrument: mockInstrument });

    const hooks = mockInstrument.mock.calls[0]![0];

    await hooks.request(mockHandleRequest, { request: mockRequest, context: undefined });

    expect(mockSetStatus).toHaveBeenCalledWith({ code: 2, message: 'internal_error' });
    expect(core.captureException).toHaveBeenCalledWith(mockError, {
      mechanism: {
        type: 'react_router.request_handler',
        handled: false,
        data: { 'http.method': 'GET', 'http.url': '/api/users' },
      },
    });
  });

  it('should capture errors in handler when no root span exists', async () => {
    const mockRequest = new Request('http://example.com/api/users');
    const mockError = new Error('Handler error');
    const mockHandleRequest = vi.fn().mockResolvedValue({ status: 'error', error: mockError });
    const mockInstrument = vi.fn();
    const mockSpan = { setStatus: vi.fn() };

    (core.getActiveSpan as any).mockReturnValue(undefined);
    (core.startSpan as any).mockImplementation((_opts: any, fn: any) => fn(mockSpan));

    const instrumentation = createSentryServerInstrumentation();
    instrumentation.handler?.({ instrument: mockInstrument });

    const hooks = mockInstrument.mock.calls[0]![0];

    await hooks.request(mockHandleRequest, { request: mockRequest, context: undefined });

    expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: 2, message: 'internal_error' });
    expect(core.captureException).toHaveBeenCalledWith(mockError, {
      mechanism: {
        type: 'react_router.request_handler',
        handled: false,
        data: { 'http.method': 'GET', 'http.url': '/api/users' },
      },
    });
  });

  it('should handle invalid URL gracefully and still call handler', async () => {
    // Create a request object with an invalid URL that will fail URL parsing
    const mockRequest = { url: 'not-a-valid-url', method: 'GET' } as unknown as Request;
    const mockHandleRequest = vi.fn().mockResolvedValue({ status: 'success', error: undefined });
    const mockInstrument = vi.fn();

    const instrumentation = createSentryServerInstrumentation();
    instrumentation.handler?.({ instrument: mockInstrument });

    const hooks = mockInstrument.mock.calls[0]![0];

    await hooks.request(mockHandleRequest, { request: mockRequest, context: undefined });

    // Handler should still be called even if URL parsing fails
    expect(mockHandleRequest).toHaveBeenCalled();
    expect(core.flushIfServerless).toHaveBeenCalled();
  });

  it('should handle relative URLs by using a dummy base', async () => {
    const mockRequest = { url: '/relative/path', method: 'GET' } as unknown as Request;
    const mockHandleRequest = vi.fn().mockResolvedValue({ status: 'success', error: undefined });
    const mockInstrument = vi.fn();
    const mockSetAttributes = vi.fn();
    const mockRootSpan = { setAttributes: mockSetAttributes };

    (core.getActiveSpan as any).mockReturnValue({});
    (core.getRootSpan as any).mockReturnValue(mockRootSpan);

    const instrumentation = createSentryServerInstrumentation();
    instrumentation.handler?.({ instrument: mockInstrument });

    const hooks = mockInstrument.mock.calls[0]![0];

    await hooks.request(mockHandleRequest, { request: mockRequest, context: undefined });

    expect(core.updateSpanName).toHaveBeenCalledWith(mockRootSpan, 'GET /relative/path');
  });

  it('should instrument route loader with spans', async () => {
    const mockCallLoader = vi.fn().mockResolvedValue({ status: 'success', error: undefined });
    const mockInstrument = vi.fn();

    (core.startSpan as any).mockImplementation((_opts: any, fn: any) => fn());
    (core.getActiveSpan as any).mockReturnValue({});
    (core.getRootSpan as any).mockReturnValue({ setAttributes: vi.fn() });

    const instrumentation = createSentryServerInstrumentation();
    instrumentation.route?.({
      id: 'test-route',
      index: false,
      path: '/users/:id',
      instrument: mockInstrument,
    });

    expect(mockInstrument).toHaveBeenCalled();
    const hooks = mockInstrument.mock.calls[0]![0];

    // Call the loader hook with RouteHandlerInstrumentationInfo
    await hooks.loader(mockCallLoader, {
      request: { method: 'GET', url: 'http://example.com/users/123', headers: { get: () => null } },
      params: { id: '123' },
      unstable_pattern: '/users/:id',
      context: undefined,
    });

    expect(core.startSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        name: '/users/:id',
        attributes: expect.objectContaining({
          'sentry.op': 'function.react_router.loader',
          'sentry.origin': 'auto.function.react_router.instrumentation_api',
        }),
      }),
      expect.any(Function),
    );
    expect(mockCallLoader).toHaveBeenCalled();
    expect(core.updateSpanName).toHaveBeenCalled();
  });

  it('should instrument route action with spans', async () => {
    const mockCallAction = vi.fn().mockResolvedValue({ status: 'success', error: undefined });
    const mockInstrument = vi.fn();

    (core.startSpan as any).mockImplementation((_opts: any, fn: any) => fn());
    (core.getActiveSpan as any).mockReturnValue({});
    (core.getRootSpan as any).mockReturnValue({ setAttributes: vi.fn() });

    const instrumentation = createSentryServerInstrumentation();
    instrumentation.route?.({
      id: 'test-route',
      index: false,
      path: '/users/:id',
      instrument: mockInstrument,
    });

    const hooks = mockInstrument.mock.calls[0]![0];

    // Call the action hook with RouteHandlerInstrumentationInfo
    await hooks.action(mockCallAction, {
      request: { method: 'POST', url: 'http://example.com/users/123', headers: { get: () => null } },
      params: { id: '123' },
      unstable_pattern: '/users/:id',
      context: undefined,
    });

    expect(core.startSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        name: '/users/:id',
        attributes: expect.objectContaining({
          'sentry.op': 'function.react_router.action',
          'sentry.origin': 'auto.function.react_router.instrumentation_api',
        }),
      }),
      expect.any(Function),
    );
  });

  async function callMiddlewareHook(options: {
    middlewareName: string | undefined;
    routeId: string;
    routePath: string;
    url: string;
  }) {
    const mockCallMiddleware = vi.fn().mockResolvedValue({ status: 'success', error: undefined });
    const mockInstrument = vi.fn();
    const mockSetAttributes = vi.fn();
    const mockRootSpan = { setAttributes: mockSetAttributes };

    vi.mocked(serverBuildModule.getMiddlewareName).mockReturnValue(options.middlewareName);

    (core.startSpan as any).mockImplementation((_opts: any, fn: any) => fn());
    (core.getActiveSpan as any).mockReturnValue({});
    (core.getRootSpan as any).mockReturnValue(mockRootSpan);

    const instrumentation = createSentryServerInstrumentation();
    instrumentation.route?.({
      id: options.routeId,
      index: false,
      path: options.routePath,
      instrument: mockInstrument,
    });

    const hooks = mockInstrument.mock.calls[0]![0];

    await hooks.middleware(mockCallMiddleware, {
      request: { method: 'GET', url: options.url, headers: { get: () => null } },
      params: {},
      unstable_pattern: options.routePath,
      context: undefined,
    });

    return { mockSetAttributes, mockRootSpan };
  }

  it('should instrument route middleware with spans (without function name)', async () => {
    const { mockSetAttributes, mockRootSpan } = await callMiddlewareHook({
      middlewareName: undefined,
      routeId: 'test-route',
      routePath: '/users/:id',
      url: 'http://example.com/users/123',
    });

    expect(core.startSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'middleware test-route',
        attributes: expect.objectContaining({
          'sentry.op': 'function.react_router.middleware',
          'sentry.origin': 'auto.function.react_router.instrumentation_api',
          'react_router.route.id': 'test-route',
          'react_router.route.pattern': '/users/:id',
          'react_router.middleware.index': 0,
        }),
      }),
      expect.any(Function),
    );

    expect(core.updateSpanName).toHaveBeenCalledWith(mockRootSpan, 'GET /users/:id');
    expect(mockSetAttributes).toHaveBeenCalledWith(
      expect.objectContaining({
        'http.route': '/users/:id',
        'sentry.source': 'route',
      }),
    );
  });

  it('should use middleware function name when available from serverBuild', async () => {
    await callMiddlewareHook({
      middlewareName: 'authMiddleware',
      routeId: 'routes/protected',
      routePath: '/protected',
      url: 'http://example.com/protected',
    });

    expect(core.startSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'middleware authMiddleware',
        attributes: expect.objectContaining({
          'sentry.op': 'function.react_router.middleware',
          'react_router.route.id': 'routes/protected',
          'react_router.route.pattern': '/protected',
          'react_router.middleware.name': 'authMiddleware',
          'react_router.middleware.index': 0,
        }),
      }),
      expect.any(Function),
    );
  });

  it('should increment middleware index for multiple middleware calls on same route', async () => {
    const mockCallMiddleware = vi.fn().mockResolvedValue({ status: 'success', error: undefined });
    const mockInstrument = vi.fn();
    const mockSetAttributes = vi.fn();
    const mockRootSpan = { setAttributes: mockSetAttributes };
    const routeId = 'routes/multi-middleware';

    // Simulate counter store that would be created by handler and stored in OTel context
    const counterStore = { counters: {} as Record<string, number> };

    // eslint-disable-next-line @typescript-eslint/unbound-method
    vi.mocked(otelApi.context.active).mockReturnValue({
      getValue: vi.fn(() => counterStore),
      setValue: vi.fn(),
    } as any);

    vi.mocked(serverBuildModule.getMiddlewareName).mockReturnValue(undefined);

    const startSpanCalls: any[] = [];
    (core.startSpan as any).mockImplementation((opts: any, fn: any) => {
      startSpanCalls.push(opts);
      return fn();
    });
    (core.getActiveSpan as any).mockReturnValue({});
    (core.getRootSpan as any).mockReturnValue(mockRootSpan);

    const instrumentation = createSentryServerInstrumentation();
    instrumentation.route?.({
      id: routeId,
      index: false,
      path: '/multi-middleware',
      instrument: mockInstrument,
    });

    const hooks = mockInstrument.mock.calls[0]![0];
    const requestInfo = {
      request: { method: 'GET', url: 'http://example.com/multi-middleware', headers: { get: () => null } },
      params: {},
      unstable_pattern: '/multi-middleware',
      context: undefined,
    };

    // Call middleware 3 times (simulating 3 middlewares on same route)
    await hooks.middleware(mockCallMiddleware, requestInfo);
    await hooks.middleware(mockCallMiddleware, requestInfo);
    await hooks.middleware(mockCallMiddleware, requestInfo);

    // Filter to only middleware spans
    const middlewareSpans = startSpanCalls.filter(
      opts => opts.attributes?.['sentry.op'] === 'function.react_router.middleware',
    );

    expect(middlewareSpans).toHaveLength(3);
    expect(middlewareSpans[0].attributes['react_router.middleware.index']).toBe(0);
    expect(middlewareSpans[1].attributes['react_router.middleware.index']).toBe(1);
    expect(middlewareSpans[2].attributes['react_router.middleware.index']).toBe(2);
  });

  it('should instrument lazy route loading with spans', async () => {
    const mockCallLazy = vi.fn().mockResolvedValue({ status: 'success', error: undefined });
    const mockInstrument = vi.fn();

    (core.startSpan as any).mockImplementation((_opts: any, fn: any) => fn());

    const instrumentation = createSentryServerInstrumentation();
    instrumentation.route?.({
      id: 'test-route',
      index: false,
      path: '/users/:id',
      instrument: mockInstrument,
    });

    const hooks = mockInstrument.mock.calls[0]![0];

    // Call the lazy hook - info is undefined for lazy loading
    await hooks.lazy(mockCallLazy, undefined);

    expect(core.startSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Lazy Route Load',
        attributes: expect.objectContaining({
          'sentry.op': 'function.react_router.lazy',
          'sentry.origin': 'auto.function.react_router.instrumentation_api',
        }),
      }),
      expect.any(Function),
    );
    expect(mockCallLazy).toHaveBeenCalled();
  });

  it('should capture errors when captureErrors is true (default)', async () => {
    const mockError = new Error('Test error');
    // React Router returns an error result, not a rejection
    const mockCallLoader = vi.fn().mockResolvedValue({ status: 'error', error: mockError });
    const mockInstrument = vi.fn();
    const mockSpan = { setStatus: vi.fn() };

    (core.startSpan as any).mockImplementation((_opts: any, fn: any) => fn(mockSpan));
    (core.getActiveSpan as any).mockReturnValue({});
    (core.getRootSpan as any).mockReturnValue({ setAttributes: vi.fn() });

    const instrumentation = createSentryServerInstrumentation();
    instrumentation.route?.({
      id: 'test-route',
      index: false,
      path: '/test',
      instrument: mockInstrument,
    });

    const hooks = mockInstrument.mock.calls[0]![0];

    await hooks.loader(mockCallLoader, {
      request: { method: 'GET', url: 'http://example.com/test', headers: { get: () => null } },
      params: {},
      unstable_pattern: '/test',
      context: undefined,
    });

    expect(core.captureException).toHaveBeenCalledWith(mockError, {
      mechanism: {
        type: 'react_router.loader',
        handled: false,
        data: { 'http.method': 'GET', 'http.url': '/test' },
      },
    });

    // Should also set span status to error for actual Error instances
    expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: 2, message: 'internal_error' });
  });

  it('should not capture errors when captureErrors is false', async () => {
    const mockError = new Error('Test error');
    // React Router returns an error result, not a rejection
    const mockCallLoader = vi.fn().mockResolvedValue({ status: 'error', error: mockError });
    const mockInstrument = vi.fn();
    const mockSpan = { setStatus: vi.fn() };

    (core.startSpan as any).mockImplementation((_opts: any, fn: any) => fn(mockSpan));
    (core.getActiveSpan as any).mockReturnValue({});
    (core.getRootSpan as any).mockReturnValue({ setAttributes: vi.fn() });

    const instrumentation = createSentryServerInstrumentation({ captureErrors: false });
    instrumentation.route?.({
      id: 'test-route',
      index: false,
      path: '/test',
      instrument: mockInstrument,
    });

    const hooks = mockInstrument.mock.calls[0]![0];

    await hooks.loader(mockCallLoader, {
      request: { method: 'GET', url: 'http://example.com/test', headers: { get: () => null } },
      params: {},
      unstable_pattern: '/test',
      context: undefined,
    });

    expect(core.captureException).not.toHaveBeenCalled();

    // Span status should still be set for Error instances (reflects actual state)
    expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: 2, message: 'internal_error' });
  });
});

describe('isInstrumentationApiUsed', () => {
  beforeEach(() => {
    delete (globalThis as any).__sentryReactRouterServerInstrumentationUsed;
  });

  afterEach(() => {
    delete (globalThis as any).__sentryReactRouterServerInstrumentationUsed;
  });

  it('should return false when flag is not set', () => {
    expect(isInstrumentationApiUsed()).toBe(false);
  });

  it('should return true when flag is set', () => {
    (globalThis as any).__sentryReactRouterServerInstrumentationUsed = true;
    expect(isInstrumentationApiUsed()).toBe(true);
  });

  it('should return true after createSentryServerInstrumentation is called', () => {
    expect(isInstrumentationApiUsed()).toBe(false);
    createSentryServerInstrumentation();
    expect(isInstrumentationApiUsed()).toBe(true);
  });
});
