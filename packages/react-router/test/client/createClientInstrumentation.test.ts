import * as browser from '@sentry/browser';
import * as core from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createSentryClientInstrumentation,
  isClientInstrumentationApiUsed,
  isNavigateHookInvoked,
} from '../../src/client/createClientInstrumentation';

vi.mock('@sentry/core', async () => {
  const actual = await vi.importActual('@sentry/core');
  return {
    ...actual,
    startSpan: vi.fn(),
    captureException: vi.fn(),
    getClient: vi.fn(),
    GLOBAL_OBJ: globalThis,
    SEMANTIC_ATTRIBUTE_SENTRY_OP: 'sentry.op',
    SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN: 'sentry.origin',
    SEMANTIC_ATTRIBUTE_SENTRY_SOURCE: 'sentry.source',
  };
});

vi.mock('@sentry/browser', () => ({
  startBrowserTracingNavigationSpan: vi.fn(),
}));

describe('createSentryClientInstrumentation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset global flag
    delete (globalThis as any).__sentryReactRouterClientInstrumentationUsed;
  });

  afterEach(() => {
    delete (globalThis as any).__sentryReactRouterClientInstrumentationUsed;
  });

  it('should create a valid client instrumentation object', () => {
    const instrumentation = createSentryClientInstrumentation();

    expect(instrumentation).toBeDefined();
    expect(typeof instrumentation.router).toBe('function');
    expect(typeof instrumentation.route).toBe('function');
  });

  it('should set the global flag when created', () => {
    expect((globalThis as any).__sentryReactRouterClientInstrumentationUsed).toBeUndefined();

    createSentryClientInstrumentation();

    expect((globalThis as any).__sentryReactRouterClientInstrumentationUsed).toBe(true);
  });

  it('should instrument router navigate with browser tracing span', async () => {
    const mockCallNavigate = vi.fn().mockResolvedValue({ status: 'success', error: undefined });
    const mockInstrument = vi.fn();
    const mockClient = {};

    (core.getClient as any).mockReturnValue(mockClient);

    const instrumentation = createSentryClientInstrumentation();
    instrumentation.router?.({ instrument: mockInstrument });

    expect(mockInstrument).toHaveBeenCalled();
    const hooks = mockInstrument.mock.calls[0]![0];

    // Call the navigate hook with proper info structure
    await hooks.navigate(mockCallNavigate, {
      currentUrl: '/home',
      to: '/about',
    });

    expect(browser.startBrowserTracingNavigationSpan).toHaveBeenCalledWith(mockClient, {
      name: '/about',
      attributes: expect.objectContaining({
        'sentry.source': 'url',
        'sentry.op': 'navigation',
        'sentry.origin': 'auto.navigation.react_router.instrumentation_api',
      }),
    });
    expect(mockCallNavigate).toHaveBeenCalled();
  });

  it('should instrument router fetch with spans', async () => {
    const mockCallFetch = vi.fn().mockResolvedValue({ status: 'success', error: undefined });
    const mockInstrument = vi.fn();

    (core.startSpan as any).mockImplementation((_opts: any, fn: any) => fn());

    const instrumentation = createSentryClientInstrumentation();
    instrumentation.router?.({ instrument: mockInstrument });

    const hooks = mockInstrument.mock.calls[0]![0];

    // Call the fetch hook with proper info structure
    await hooks.fetch(mockCallFetch, {
      href: '/api/data',
      currentUrl: '/home',
      fetcherKey: 'fetcher-1',
    });

    expect(core.startSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Fetcher fetcher-1',
        attributes: expect.objectContaining({
          'sentry.op': 'function.react_router.fetcher',
          'sentry.origin': 'auto.function.react_router.instrumentation_api',
        }),
      }),
      expect.any(Function),
    );
    expect(mockCallFetch).toHaveBeenCalled();
  });

  it('should instrument route loader with spans', async () => {
    const mockCallLoader = vi.fn().mockResolvedValue({ status: 'success', error: undefined });
    const mockInstrument = vi.fn();

    (core.startSpan as any).mockImplementation((_opts: any, fn: any) => fn());

    const instrumentation = createSentryClientInstrumentation();
    // Route has id, index, path as required properties
    instrumentation.route?.({
      id: 'test-route',
      index: false,
      path: '/test',
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
          'sentry.op': 'function.react_router.client_loader',
          'sentry.origin': 'auto.function.react_router.instrumentation_api',
        }),
      }),
      expect.any(Function),
    );
    expect(mockCallLoader).toHaveBeenCalled();
  });

  it('should instrument route action with spans', async () => {
    const mockCallAction = vi.fn().mockResolvedValue({ status: 'success', error: undefined });
    const mockInstrument = vi.fn();

    (core.startSpan as any).mockImplementation((_opts: any, fn: any) => fn());

    const instrumentation = createSentryClientInstrumentation();
    instrumentation.route?.({
      id: 'test-route',
      index: false,
      path: '/test',
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
          'sentry.op': 'function.react_router.client_action',
          'sentry.origin': 'auto.function.react_router.instrumentation_api',
        }),
      }),
      expect.any(Function),
    );
  });

  it('should capture errors when captureErrors is true (default)', async () => {
    const mockError = new Error('Test error');
    // React Router returns an error result, not a rejection
    const mockCallLoader = vi.fn().mockResolvedValue({ status: 'error', error: mockError });
    const mockInstrument = vi.fn();

    (core.startSpan as any).mockImplementation((_opts: any, fn: any) => fn());

    const instrumentation = createSentryClientInstrumentation();
    instrumentation.route?.({
      id: 'test-route',
      index: false,
      path: '/test',
      instrument: mockInstrument,
    });

    const hooks = mockInstrument.mock.calls[0]![0];

    await hooks.loader(mockCallLoader, {
      request: { method: 'GET', url: 'http://example.com/test-path', headers: { get: () => null } },
      params: {},
      unstable_pattern: '/test-path',
      context: undefined,
    });

    expect(core.captureException).toHaveBeenCalledWith(mockError, {
      mechanism: { type: 'react_router.client_loader', handled: false },
      data: {
        'http.url': '/test-path',
      },
    });
  });

  it('should not capture errors when captureErrors is false', async () => {
    const mockError = new Error('Test error');
    // React Router returns an error result, not a rejection
    const mockCallLoader = vi.fn().mockResolvedValue({ status: 'error', error: mockError });
    const mockInstrument = vi.fn();

    (core.startSpan as any).mockImplementation((_opts: any, fn: any) => fn());

    const instrumentation = createSentryClientInstrumentation({ captureErrors: false });
    instrumentation.route?.({
      id: 'test-route',
      index: false,
      path: '/test',
      instrument: mockInstrument,
    });

    const hooks = mockInstrument.mock.calls[0]![0];

    await hooks.loader(mockCallLoader, {
      request: { method: 'GET', url: 'http://example.com/test-path', headers: { get: () => null } },
      params: {},
      unstable_pattern: '/test-path',
      context: undefined,
    });

    expect(core.captureException).not.toHaveBeenCalled();
  });

  it('should capture navigate errors', async () => {
    const mockError = new Error('Navigation error');
    // React Router returns an error result, not a rejection
    const mockCallNavigate = vi.fn().mockResolvedValue({ status: 'error', error: mockError });
    const mockInstrument = vi.fn();

    (core.getClient as any).mockReturnValue({});

    const instrumentation = createSentryClientInstrumentation();
    instrumentation.router?.({ instrument: mockInstrument });

    const hooks = mockInstrument.mock.calls[0]![0];

    await hooks.navigate(mockCallNavigate, {
      currentUrl: '/home',
      to: '/about',
    });

    expect(core.captureException).toHaveBeenCalledWith(mockError, {
      mechanism: { type: 'react_router.navigate', handled: false },
      data: {
        'http.url': '/about',
      },
    });
  });

  it('should fall back to URL pathname when unstable_pattern is undefined', async () => {
    const mockCallLoader = vi.fn().mockResolvedValue({ status: 'success', error: undefined });
    const mockInstrument = vi.fn();

    (core.startSpan as any).mockImplementation((_opts: any, fn: any) => fn());

    const instrumentation = createSentryClientInstrumentation();
    instrumentation.route?.({
      id: 'test-route',
      index: false,
      path: '/test',
      instrument: mockInstrument,
    });

    const hooks = mockInstrument.mock.calls[0]![0];

    // Call with undefined unstable_pattern - should fall back to pathname
    await hooks.loader(mockCallLoader, {
      request: { method: 'GET', url: 'http://example.com/users/123', headers: { get: () => null } },
      params: { id: '123' },
      unstable_pattern: undefined,
      context: undefined,
    });

    expect(core.startSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        name: '/users/123',
      }),
      expect.any(Function),
    );
  });

  it('should instrument route middleware with spans', async () => {
    const mockCallMiddleware = vi.fn().mockResolvedValue({ status: 'success', error: undefined });
    const mockInstrument = vi.fn();

    (core.startSpan as any).mockImplementation((_opts: any, fn: any) => fn());

    const instrumentation = createSentryClientInstrumentation();
    instrumentation.route?.({
      id: 'test-route',
      index: false,
      path: '/users/:id',
      instrument: mockInstrument,
    });

    const hooks = mockInstrument.mock.calls[0]![0];

    await hooks.middleware(mockCallMiddleware, {
      request: { method: 'GET', url: 'http://example.com/users/123', headers: { get: () => null } },
      params: { id: '123' },
      unstable_pattern: '/users/:id',
      context: undefined,
    });

    expect(core.startSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        name: '/users/:id',
        attributes: expect.objectContaining({
          'sentry.op': 'function.react_router.client_middleware',
          'sentry.origin': 'auto.function.react_router.instrumentation_api',
        }),
      }),
      expect.any(Function),
    );
  });

  it('should instrument lazy route loading with spans', async () => {
    const mockCallLazy = vi.fn().mockResolvedValue({ status: 'success', error: undefined });
    const mockInstrument = vi.fn();

    (core.startSpan as any).mockImplementation((_opts: any, fn: any) => fn());

    const instrumentation = createSentryClientInstrumentation();
    instrumentation.route?.({
      id: 'test-route',
      index: false,
      path: '/users/:id',
      instrument: mockInstrument,
    });

    const hooks = mockInstrument.mock.calls[0]![0];

    await hooks.lazy(mockCallLazy, undefined);

    expect(core.startSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Lazy Route Load',
        attributes: expect.objectContaining({
          'sentry.op': 'function.react_router.client_lazy',
          'sentry.origin': 'auto.function.react_router.instrumentation_api',
        }),
      }),
      expect.any(Function),
    );
  });
});

describe('isClientInstrumentationApiUsed', () => {
  beforeEach(() => {
    delete (globalThis as any).__sentryReactRouterClientInstrumentationUsed;
  });

  afterEach(() => {
    delete (globalThis as any).__sentryReactRouterClientInstrumentationUsed;
  });

  it('should return false when flag is not set', () => {
    expect(isClientInstrumentationApiUsed()).toBe(false);
  });

  it('should return true when flag is set', () => {
    (globalThis as any).__sentryReactRouterClientInstrumentationUsed = true;
    expect(isClientInstrumentationApiUsed()).toBe(true);
  });

  it('should return true after createSentryClientInstrumentation is called', () => {
    expect(isClientInstrumentationApiUsed()).toBe(false);
    createSentryClientInstrumentation();
    expect(isClientInstrumentationApiUsed()).toBe(true);
  });
});

describe('isNavigateHookInvoked', () => {
  beforeEach(() => {
    delete (globalThis as any).__sentryReactRouterNavigateHookInvoked;
    delete (globalThis as any).__sentryReactRouterClientInstrumentationUsed;
  });

  afterEach(() => {
    delete (globalThis as any).__sentryReactRouterNavigateHookInvoked;
    delete (globalThis as any).__sentryReactRouterClientInstrumentationUsed;
  });

  it('should return false when flag is not set', () => {
    expect(isNavigateHookInvoked()).toBe(false);
  });

  it('should return true when flag is set', () => {
    (globalThis as any).__sentryReactRouterNavigateHookInvoked = true;
    expect(isNavigateHookInvoked()).toBe(true);
  });

  it('should return false after createSentryClientInstrumentation is called (before navigate)', () => {
    createSentryClientInstrumentation();
    // Flag should not be set just by creating instrumentation
    // It only gets set when the navigate hook is actually invoked
    expect(isNavigateHookInvoked()).toBe(false);
  });

  it('should return true after navigate hook is invoked', async () => {
    const mockCallNavigate = vi.fn().mockResolvedValue({ status: 'success', error: undefined });
    const mockInstrument = vi.fn();

    (core.getClient as any).mockReturnValue({});

    const instrumentation = createSentryClientInstrumentation();
    instrumentation.router?.({ instrument: mockInstrument });

    // Before navigation, flag should be false
    expect(isNavigateHookInvoked()).toBe(false);

    const hooks = mockInstrument.mock.calls[0]![0];

    // Call the navigate hook
    await hooks.navigate(mockCallNavigate, {
      currentUrl: '/home',
      to: '/about',
    });

    // After navigation, flag should be true
    expect(isNavigateHookInvoked()).toBe(true);
  });
});
