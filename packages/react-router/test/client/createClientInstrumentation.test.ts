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
  startBrowserTracingNavigationSpan: vi.fn().mockReturnValue({ setStatus: vi.fn() }),
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

  it('should NOT set the global flag when created (only when router() is called)', () => {
    expect((globalThis as any).__sentryReactRouterClientInstrumentationUsed).toBeUndefined();

    createSentryClientInstrumentation();

    // Flag should NOT be set just by creating instrumentation
    // This is important for Framework Mode where router() is never called
    expect((globalThis as any).__sentryReactRouterClientInstrumentationUsed).toBeUndefined();
  });

  it('should set the global flag when router() is called by React Router', () => {
    expect((globalThis as any).__sentryReactRouterClientInstrumentationUsed).toBeUndefined();

    const mockInstrument = vi.fn();
    const instrumentation = createSentryClientInstrumentation();

    // Flag should not be set yet
    expect((globalThis as any).__sentryReactRouterClientInstrumentationUsed).toBeUndefined();

    // When React Router calls router(), the flag should be set
    instrumentation.router?.({ instrument: mockInstrument });

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
        'navigation.type': 'router.navigate',
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
    const mockSpan = { setStatus: vi.fn() };

    (core.startSpan as any).mockImplementation((_opts: any, fn: any) => fn(mockSpan));

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
      mechanism: { type: 'react_router.client_loader', handled: false, data: { 'http.url': '/test-path' } },
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

    // Span status should still be set for Error instances (reflects actual state)
    expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: 2, message: 'internal_error' });
  });

  it('should capture navigate errors and set span status', async () => {
    const mockError = new Error('Navigation error');
    // React Router returns an error result, not a rejection
    const mockCallNavigate = vi.fn().mockResolvedValue({ status: 'error', error: mockError });
    const mockInstrument = vi.fn();
    const mockNavigationSpan = { setStatus: vi.fn() };

    (core.getClient as any).mockReturnValue({});
    (browser.startBrowserTracingNavigationSpan as any).mockReturnValue(mockNavigationSpan);

    const instrumentation = createSentryClientInstrumentation();
    instrumentation.router?.({ instrument: mockInstrument });

    const hooks = mockInstrument.mock.calls[0]![0];

    await hooks.navigate(mockCallNavigate, {
      currentUrl: '/home',
      to: '/about',
    });

    expect(core.captureException).toHaveBeenCalledWith(mockError, {
      mechanism: { type: 'react_router.navigate', handled: false, data: { 'http.url': '/about' } },
    });

    // Should set span status to error
    expect(mockNavigationSpan.setStatus).toHaveBeenCalledWith({ code: 2, message: 'internal_error' });
  });

  describe('numeric navigations (history back/forward)', () => {
    const originalLocation = globalThis.location;

    beforeEach(() => {
      (globalThis as any).location = { pathname: '/current-page' };
    });

    afterEach(() => {
      if (originalLocation) {
        (globalThis as any).location = originalLocation;
      } else {
        delete (globalThis as any).location;
      }
    });

    it.each([
      { to: -1, expectedType: 'router.back', destination: '/previous-page' },
      { to: -2, expectedType: 'router.back', destination: '/two-pages-back' },
      { to: 1, expectedType: 'router.forward', destination: '/next-page' },
    ])(
      'should create navigation span for navigate($to) with navigation.type $expectedType',
      async ({ to, expectedType, destination }) => {
        const mockCallNavigate = vi.fn().mockImplementation(async () => {
          (globalThis as any).location.pathname = destination;
          return { status: 'success', error: undefined };
        });
        const mockInstrument = vi.fn();
        const mockNavigationSpan = { setStatus: vi.fn(), updateName: vi.fn() };
        const mockClient = {};

        (core.getClient as any).mockReturnValue(mockClient);
        (browser.startBrowserTracingNavigationSpan as any).mockReturnValue(mockNavigationSpan);

        const instrumentation = createSentryClientInstrumentation();
        instrumentation.router?.({ instrument: mockInstrument });
        const hooks = mockInstrument.mock.calls[0]![0];

        await hooks.navigate(mockCallNavigate, { currentUrl: '/current-page', to });

        expect(browser.startBrowserTracingNavigationSpan).toHaveBeenCalledWith(mockClient, {
          name: '/current-page',
          attributes: expect.objectContaining({
            'sentry.source': 'url',
            'sentry.op': 'navigation',
            'sentry.origin': 'auto.navigation.react_router.instrumentation_api',
            'navigation.type': expectedType,
          }),
        });
        expect(mockNavigationSpan.updateName).toHaveBeenCalledWith(destination);
      },
    );

    it('should skip span creation for navigate(0) since it triggers a page reload', async () => {
      const mockCallNavigate = vi.fn().mockResolvedValue({ status: 'success', error: undefined });
      const mockInstrument = vi.fn();

      (core.getClient as any).mockReturnValue({});

      const instrumentation = createSentryClientInstrumentation();
      instrumentation.router?.({ instrument: mockInstrument });
      const hooks = mockInstrument.mock.calls[0]![0];

      await hooks.navigate(mockCallNavigate, { currentUrl: '/current-page', to: 0 });

      expect(browser.startBrowserTracingNavigationSpan).not.toHaveBeenCalled();
      expect(mockCallNavigate).toHaveBeenCalled();
    });

    it('should set error status on span for failed numeric navigation', async () => {
      const mockError = new Error('Navigation failed');
      const mockCallNavigate = vi.fn().mockImplementation(async () => {
        (globalThis as any).location.pathname = '/error-page';
        return { status: 'error', error: mockError };
      });
      const mockInstrument = vi.fn();
      const mockNavigationSpan = { setStatus: vi.fn(), updateName: vi.fn() };

      (core.getClient as any).mockReturnValue({});
      (browser.startBrowserTracingNavigationSpan as any).mockReturnValue(mockNavigationSpan);

      const instrumentation = createSentryClientInstrumentation();
      instrumentation.router?.({ instrument: mockInstrument });
      const hooks = mockInstrument.mock.calls[0]![0];

      await hooks.navigate(mockCallNavigate, { currentUrl: '/current-page', to: -1 });

      expect(mockNavigationSpan.setStatus).toHaveBeenCalledWith({ code: 2, message: 'internal_error' });
      expect(core.captureException).toHaveBeenCalledWith(mockError, {
        mechanism: { type: 'react_router.navigate', handled: false, data: { 'http.url': '/error-page' } },
      });
    });

    it('should set navigate hook invoked flag for numeric navigations but NOT for navigate(0)', async () => {
      const mockInstrument = vi.fn();
      const mockNavigationSpan = { setStatus: vi.fn(), updateName: vi.fn() };

      (core.getClient as any).mockReturnValue({});
      (browser.startBrowserTracingNavigationSpan as any).mockReturnValue(mockNavigationSpan);

      delete (globalThis as any).__sentryReactRouterNavigateHookInvoked;

      const instrumentation = createSentryClientInstrumentation();
      instrumentation.router?.({ instrument: mockInstrument });
      const hooks = mockInstrument.mock.calls[0]![0];

      // navigate(0) should NOT set flag
      await hooks.navigate(vi.fn().mockResolvedValue({ status: 'success', error: undefined }), {
        currentUrl: '/current-page',
        to: 0,
      });
      expect(isNavigateHookInvoked()).toBe(false);

      // navigate(-1) should set flag
      await hooks.navigate(vi.fn().mockResolvedValue({ status: 'success', error: undefined }), {
        currentUrl: '/current-page',
        to: -1,
      });
      expect(isNavigateHookInvoked()).toBe(true);
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

  describe('popstate listener (browser back/forward button)', () => {
    const originalLocation = globalThis.location;
    const originalAddEventListener = globalThis.addEventListener;
    let addEventListenerSpy: ReturnType<typeof vi.fn>;
    let popstateHandler: (() => void) | null = null;

    beforeEach(() => {
      delete (globalThis as any).__sentryReactRouterPopstateListenerAdded;
      delete (globalThis as any).__sentryReactRouterClientInstrumentationUsed;

      (globalThis as any).location = { pathname: '/current-page' };

      popstateHandler = null;
      addEventListenerSpy = vi.fn((event, handler) => {
        if (event === 'popstate') {
          popstateHandler = handler;
        }
      });
      (globalThis as any).addEventListener = addEventListenerSpy;
    });

    afterEach(() => {
      if (originalLocation) {
        (globalThis as any).location = originalLocation;
      } else {
        delete (globalThis as any).location;
      }
      (globalThis as any).addEventListener = originalAddEventListener;
      delete (globalThis as any).__sentryReactRouterPopstateListenerAdded;
    });

    it('should register popstate listener once when router() is called', () => {
      const mockInstrument = vi.fn();
      const instrumentation = createSentryClientInstrumentation();

      instrumentation.router?.({ instrument: mockInstrument });
      instrumentation.router?.({ instrument: mockInstrument });

      const popstateCalls = addEventListenerSpy.mock.calls.filter((call: string[]) => call[0] === 'popstate');
      expect(popstateCalls.length).toBe(1);
    });

    it('should create navigation span with browser.popstate type on popstate event', () => {
      const mockClient = {};
      (core.getClient as any).mockReturnValue(mockClient);

      const mockInstrument = vi.fn();
      const instrumentation = createSentryClientInstrumentation();
      instrumentation.router?.({ instrument: mockInstrument });

      popstateHandler!();

      expect(browser.startBrowserTracingNavigationSpan).toHaveBeenCalledWith(mockClient, {
        name: '/current-page',
        attributes: expect.objectContaining({
          'sentry.source': 'url',
          'sentry.op': 'navigation',
          'sentry.origin': 'auto.navigation.react_router.instrumentation_api',
          'navigation.type': 'browser.popstate',
        }),
      });
    });

    it('should not create span on popstate when no client is available', () => {
      (core.getClient as any).mockReturnValue(undefined);

      const mockInstrument = vi.fn();
      const instrumentation = createSentryClientInstrumentation();
      instrumentation.router?.({ instrument: mockInstrument });

      popstateHandler!();

      expect(browser.startBrowserTracingNavigationSpan).not.toHaveBeenCalled();
    });

    it('should update existing numeric navigation span on popstate instead of creating duplicate', async () => {
      const mockClient = {};
      const mockNavigationSpan = {
        setStatus: vi.fn(),
        updateName: vi.fn(),
        isRecording: vi.fn().mockReturnValue(true),
      };

      (core.getClient as any).mockReturnValue(mockClient);
      (browser.startBrowserTracingNavigationSpan as any).mockReturnValue(mockNavigationSpan);

      const mockCallNavigate = vi.fn().mockImplementation(async () => {
        (globalThis as any).location.pathname = '/previous-page';
        popstateHandler!();
        return { status: 'success', error: undefined };
      });
      const mockInstrument = vi.fn();

      const instrumentation = createSentryClientInstrumentation();
      instrumentation.router?.({ instrument: mockInstrument });
      const hooks = mockInstrument.mock.calls[0]![0];

      await hooks.navigate(mockCallNavigate, { currentUrl: '/current-page', to: -1 });

      // Only ONE span created (not two - no duplicate from popstate)
      expect(browser.startBrowserTracingNavigationSpan).toHaveBeenCalledTimes(1);
      expect(mockNavigationSpan.updateName).toHaveBeenCalledWith('/previous-page');
    });

    it('should create new span on popstate when no numeric navigation is in progress', () => {
      const mockClient = {};
      (core.getClient as any).mockReturnValue(mockClient);

      const mockInstrument = vi.fn();
      const instrumentation = createSentryClientInstrumentation();
      instrumentation.router?.({ instrument: mockInstrument });

      // Direct popstate without navigate(-1) - simulates browser back button click
      popstateHandler!();

      expect(browser.startBrowserTracingNavigationSpan).toHaveBeenCalledWith(mockClient, {
        name: '/current-page',
        attributes: expect.objectContaining({
          'navigation.type': 'browser.popstate',
        }),
      });
    });
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

  it('should return false after createSentryClientInstrumentation is called (flag set only when router() called)', () => {
    expect(isClientInstrumentationApiUsed()).toBe(false);
    createSentryClientInstrumentation();
    // Flag is NOT set just by creating instrumentation - it's set when router() is called
    // This is important for Framework Mode where router() is never called
    expect(isClientInstrumentationApiUsed()).toBe(false);
  });

  it('should return true after router() is called', () => {
    const mockInstrument = vi.fn();
    expect(isClientInstrumentationApiUsed()).toBe(false);
    const instrumentation = createSentryClientInstrumentation();
    expect(isClientInstrumentationApiUsed()).toBe(false);
    instrumentation.router?.({ instrument: mockInstrument });
    expect(isClientInstrumentationApiUsed()).toBe(true);
  });
});

describe('isNavigateHookInvoked', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (globalThis as any).__sentryReactRouterNavigateHookInvoked;
    delete (globalThis as any).__sentryReactRouterClientInstrumentationUsed;
  });

  afterEach(() => {
    delete (globalThis as any).__sentryReactRouterNavigateHookInvoked;
    delete (globalThis as any).__sentryReactRouterClientInstrumentationUsed;
  });

  it('should return false when flag is not set and true when set', () => {
    expect(isNavigateHookInvoked()).toBe(false);
    (globalThis as any).__sentryReactRouterNavigateHookInvoked = true;
    expect(isNavigateHookInvoked()).toBe(true);
  });

  it('should set flag after navigate hook is invoked even without client', async () => {
    const mockCallNavigate = vi.fn().mockResolvedValue({ status: 'success', error: undefined });
    const mockInstrument = vi.fn();

    (core.getClient as any).mockReturnValue(undefined);

    const instrumentation = createSentryClientInstrumentation();
    instrumentation.router?.({ instrument: mockInstrument });

    expect(isNavigateHookInvoked()).toBe(false);

    const hooks = mockInstrument.mock.calls[0]![0];

    await hooks.navigate(mockCallNavigate, { currentUrl: '/home', to: '/about' });

    expect(isNavigateHookInvoked()).toBe(true);
    expect(browser.startBrowserTracingNavigationSpan).not.toHaveBeenCalled();
  });
});
