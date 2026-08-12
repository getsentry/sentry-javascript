import * as browser from '@sentry/browser';
import * as core from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { instrumentHydratedRouter } from '../../src/client/hydratedRouter';
import { SEMANTIC_ATTRIBUTE_SENTRY_SOURCE } from '@sentry/core';

vi.mock('@sentry/core', async () => {
  const actual = await vi.importActual<any>('@sentry/core');
  return {
    ...actual,
    getActiveSpan: vi.fn(),
    getRootSpan: vi.fn(),
    spanToStreamedSpanJSON: vi.fn(),
    getClient: vi.fn(),
    debug: {
      warn: vi.fn(),
    },
    SEMANTIC_ATTRIBUTE_SENTRY_OP: 'sentry.op',
    SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN: 'sentry.origin',
    SEMANTIC_ATTRIBUTE_SENTRY_SOURCE: 'sentry.source',
    GLOBAL_OBJ: globalThis,
  };
});
vi.mock('@sentry/browser', () => ({
  startBrowserTracingNavigationSpan: vi.fn(),
  getAbsoluteUrl: vi.fn((urlOrPath: string) => {
    try {
      return new URL(urlOrPath, 'https://example.com').toString();
    } catch {
      return urlOrPath;
    }
  }),
}));

describe('instrumentHydratedRouter', () => {
  let originalRouter: any;
  let mockRouter: any;
  let mockPageloadSpan: any;
  let mockNavigationSpan: any;

  beforeEach(() => {
    originalRouter = (globalThis as any).__reactRouterDataRouter;
    (globalThis as any).location = {
      href: 'https://example.com/foo/bar',
      origin: 'https://example.com',
      pathname: '/foo/bar',
      search: '',
      hash: '',
    };
    mockRouter = {
      state: {
        location: { pathname: '/foo/bar' },
        matches: [{ route: { path: '/foo/:id' } }],
      },
      navigate: vi.fn(),
      subscribe: vi.fn(),
    };
    (globalThis as any).__reactRouterDataRouter = mockRouter;

    mockPageloadSpan = { updateName: vi.fn(), setAttributes: vi.fn(), setAttribute: vi.fn() };
    mockNavigationSpan = { updateName: vi.fn(), setAttributes: vi.fn(), setAttribute: vi.fn() };

    (core.getActiveSpan as any).mockReturnValue(mockPageloadSpan);
    (core.getRootSpan as any).mockImplementation((span: any) => span);
    (core.spanToStreamedSpanJSON as any).mockImplementation((span: any) => ({
      name: '/foo/bar',
      // Distinguish so the subscribe callback can branch on op (pageload vs. navigation).
      attributes: { 'sentry.op': span === mockNavigationSpan ? 'navigation' : 'pageload' },
    }));
    (core.getClient as any).mockReturnValue({});
    (browser.startBrowserTracingNavigationSpan as any).mockReturnValue(mockNavigationSpan);
  });

  afterEach(() => {
    (globalThis as any).__reactRouterDataRouter = originalRouter;
    vi.clearAllMocks();
  });

  it('subscribes to the router and patches navigate', () => {
    instrumentHydratedRouter();
    expect(typeof mockRouter.navigate).toBe('function');
    expect(mockRouter.subscribe).toHaveBeenCalled();
  });

  it('updates pageload transaction name if needed', () => {
    instrumentHydratedRouter();
    expect(mockPageloadSpan.updateName).toHaveBeenCalled();
    expect(mockPageloadSpan.setAttributes).toHaveBeenCalled();
  });

  it('creates navigation transaction on navigate', () => {
    instrumentHydratedRouter();
    mockRouter.navigate('/bar');
    expect(browser.startBrowserTracingNavigationSpan).toHaveBeenCalled();
  });

  it('updates navigation transaction on state change to idle', () => {
    instrumentHydratedRouter();
    // Simulate a state change to idle
    const callback = mockRouter.subscribe.mock.calls[0][0];
    const newState = {
      location: { pathname: '/foo/bar' },
      matches: [{ route: { path: '/foo/:id' } }],
      navigation: { state: 'idle' },
    };
    mockRouter.navigate('/foo/bar');
    // After navigation, the active span should be the navigation span
    (core.getActiveSpan as any).mockReturnValue(mockNavigationSpan);
    callback(newState);
    expect(mockNavigationSpan.updateName).toHaveBeenCalledWith('/foo/:id');
    expect(mockNavigationSpan.setAttributes).toHaveBeenCalledWith({
      [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
      'url.template': '/foo/:id',
    });
  });

  it('does not overwrite pageload origin when the pageload is still active', () => {
    // Regression test for #20784: a static-route pageload (where pathname == rootSpanName) was
    // being tagged with `origin: auto.navigation.react_router` because the subscribe callback
    // re-wrote origin unconditionally, even when the active root span was still the pageload.
    instrumentHydratedRouter();
    const callback = mockRouter.subscribe.mock.calls[0][0];
    const newState = {
      location: { pathname: '/foo/bar' },
      matches: [{ route: { path: '/foo/:id' } }],
      navigation: { state: 'idle' },
    };
    // Active root span is still the pageload (no navigation has happened yet).
    (core.getActiveSpan as any).mockReturnValue(mockPageloadSpan);
    callback(newState);
    // Subscribe callback must not touch the navigation span, and must not write `origin` on the
    // pageload — only `source`/`url.template` via the attribute setter. The pageload origin was
    // already set by trySubscribe.
    expect(mockNavigationSpan.setAttribute).not.toHaveBeenCalled();
    expect(mockNavigationSpan.setAttributes).not.toHaveBeenCalled();
    expect(mockPageloadSpan.setAttributes).toHaveBeenLastCalledWith({
      [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
      'url.template': '/foo/:id',
    });
  });

  it('still parameterizes a navigation root via subscribe (backstop) when the API is active but the route had no hook (source:url)', () => {
    // Routes without a loader/action never trigger a route hook, so the navigation root is still
    // source:url. The heuristic must still parameterize it instead of leaving the raw URL.
    (globalThis as any).__sentryReactRouterClientInstrumentationUsed = true;
    (core.spanToStreamedSpanJSON as any).mockImplementation((span: any) => ({
      name: '/foo/bar',
      attributes: { 'sentry.op': span === mockNavigationSpan ? 'navigation' : 'pageload', source: 'url' },
    }));

    instrumentHydratedRouter();
    const callback = mockRouter.subscribe.mock.calls[0][0];
    const newState = {
      location: { pathname: '/foo/bar' },
      matches: [{ route: { path: '/foo/:id' } }],
      navigation: { state: 'idle' },
    };
    (core.getActiveSpan as any).mockReturnValue(mockNavigationSpan);
    callback(newState);

    expect(mockNavigationSpan.updateName).toHaveBeenCalledWith('/foo/:id');
    expect(mockNavigationSpan.setAttributes).toHaveBeenCalledWith({
      [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
      'url.template': '/foo/:id',
    });

    delete (globalThis as any).__sentryReactRouterClientInstrumentationUsed;
  });

  it('does not update navigation transaction on state change to loading', () => {
    instrumentHydratedRouter();
    // Simulate a state change to loading (non-idle)
    const callback = mockRouter.subscribe.mock.calls[0][0];
    const newState = {
      location: { pathname: '/foo/bar' },
      matches: [{ route: { path: '/foo/:id' } }],
      navigation: { state: 'loading' },
    };
    mockRouter.navigate('/foo/bar');
    // After navigation, the active span should be the navigation span
    (core.getActiveSpan as any).mockReturnValue(mockNavigationSpan);
    callback(newState);
    expect(mockNavigationSpan.updateName).not.toHaveBeenCalled();
    expect(mockNavigationSpan.setAttributes).not.toHaveBeenCalled();
  });

  it('skips navigation span creation when client instrumentation API is enabled', () => {
    // Simulate that the client instrumentation API is enabled
    // (meaning the instrumentation API handles navigation spans and we should avoid double-counting)
    (globalThis as any).__sentryReactRouterClientInstrumentationUsed = true;

    instrumentHydratedRouter();
    mockRouter.navigate('/bar');

    // Should not create a navigation span because instrumentation API is handling it
    expect(browser.startBrowserTracingNavigationSpan).not.toHaveBeenCalled();

    // Clean up
    delete (globalThis as any).__sentryReactRouterClientInstrumentationUsed;
  });

  it('creates navigation transaction with correct name when navigate is called with an object `to`', () => {
    instrumentHydratedRouter();
    mockRouter.navigate({ pathname: '/items/123', search: '?foo=bar' });
    expect(browser.startBrowserTracingNavigationSpan).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        name: '/items/123',
      }),
      // the destination URL keeps the query string, even though the span name doesn't
      { url: 'https://example.com/items/123?foo=bar' },
    );
  });

  it('resolves relative navigate targets against the current URL', () => {
    instrumentHydratedRouter();
    mockRouter.navigate('settings');
    expect(browser.startBrowserTracingNavigationSpan).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        name: 'settings',
      }),
      { url: 'https://example.com/foo/bar/settings' },
    );
  });

  it('parameterizes relative navigation via subscribe when url.path matches destination', () => {
    instrumentHydratedRouter();
    mockRouter.navigate('settings');

    (core.getActiveSpan as any).mockReturnValue(mockNavigationSpan);
    (core.spanToStreamedSpanJSON as any).mockImplementation((span: any) => ({
      name: 'settings',
      attributes: {
        'sentry.op': span === mockNavigationSpan ? 'navigation' : 'pageload',
        'url.path': '/foo/bar/settings',
      },
    }));

    const callback = mockRouter.subscribe.mock.calls[0][0];
    callback({
      location: { pathname: '/foo/bar/settings' },
      matches: [{ route: { path: '/foo/bar/settings' } }],
      navigation: { state: 'idle' },
    });

    expect(mockNavigationSpan.updateName).toHaveBeenCalledWith('/foo/bar/settings');
    expect(mockNavigationSpan.setAttributes).toHaveBeenCalledWith({
      [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
      'url.template': '/foo/bar/settings',
    });
  });

  it('creates navigation transaction with current pathname when navigate is called with a number', () => {
    instrumentHydratedRouter();
    mockRouter.navigate(-1);
    expect(browser.startBrowserTracingNavigationSpan).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        name: '/foo/bar',
      }),
      { url: 'https://example.com/foo/bar' },
    );
  });

  it('updates navigation span to destination pathname after numeric navigate completes', async () => {
    const navigateResult = Promise.resolve();
    mockRouter.navigate = vi.fn().mockImplementation(() => {
      (globalThis as any).location.pathname = '/foo';
      mockRouter.state = {
        location: { pathname: '/foo' },
        matches: [{ route: { path: '/foo/:id' } }],
        navigation: { state: 'idle' },
      };
      return navigateResult;
    });

    instrumentHydratedRouter();
    mockRouter.navigate(-1);

    await navigateResult;

    expect(mockNavigationSpan.updateName).toHaveBeenCalledWith('/foo');
    expect(mockNavigationSpan.setAttributes).toHaveBeenCalledWith({
      'sentry.source': 'url',
      'url.path': '/foo',
      'url.full': 'https://example.com/foo',
    });
    expect(mockNavigationSpan.updateName).toHaveBeenLastCalledWith('/foo/:id');
    expect(mockNavigationSpan.setAttributes).toHaveBeenLastCalledWith({
      [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
      'url.template': '/foo/:id',
    });
  });

  it('finalizes navigation span even when numeric navigate rejects', async () => {
    let rejectNavigate!: (reason?: unknown) => void;
    const navigateResult = new Promise<void>((_, reject) => {
      rejectNavigate = reject;
    });
    mockRouter.navigate = vi.fn().mockImplementation(() => {
      (globalThis as any).location.pathname = '/foo';
      mockRouter.state = {
        location: { pathname: '/foo' },
        matches: [{ route: { path: '/foo/:id' } }],
        navigation: { state: 'idle' },
      };
      return navigateResult;
    });

    instrumentHydratedRouter();
    mockRouter.navigate(-1);

    rejectNavigate(new Error('navigation failed'));
    await navigateResult.catch(() => undefined);

    expect(mockNavigationSpan.setAttributes).toHaveBeenCalledWith({
      'sentry.source': 'url',
      'url.path': '/foo',
      'url.full': 'https://example.com/foo',
    });
    expect(mockNavigationSpan.updateName).toHaveBeenLastCalledWith('/foo/:id');
  });

  it('parameterizes numeric navigation via subscribe when router state is stale on sync finalize', () => {
    mockRouter.navigate = vi.fn().mockImplementation(() => {
      (globalThis as any).location.pathname = '/foo';
      return undefined;
    });

    instrumentHydratedRouter();
    mockRouter.navigate(-1);

    expect(mockNavigationSpan.updateName).toHaveBeenCalledWith('/foo');
    expect(mockNavigationSpan.updateName).toHaveBeenCalledTimes(1);
    expect(mockNavigationSpan.setAttributes).toHaveBeenCalledWith({
      'sentry.source': 'url',
      'url.path': '/foo',
      'url.full': 'https://example.com/foo',
    });

    (core.getActiveSpan as any).mockReturnValue(mockNavigationSpan);
    (core.spanToStreamedSpanJSON as any).mockImplementation((span: any) => ({
      name: '/foo/bar',
      attributes: { 'sentry.op': span === mockNavigationSpan ? 'navigation' : 'pageload', 'url.path': '/foo' },
    }));

    const callback = mockRouter.subscribe.mock.calls[0][0];
    callback({
      location: { pathname: '/foo' },
      matches: [{ route: { path: '/foo/:id' } }],
      navigation: { state: 'idle' },
    });

    expect(mockNavigationSpan.updateName).toHaveBeenCalledWith('/foo/:id');
    expect(mockNavigationSpan.setAttributes).toHaveBeenLastCalledWith({
      [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
      'url.template': '/foo/:id',
    });
  });

  it('does not create navigation span for navigate(0)', () => {
    instrumentHydratedRouter();
    mockRouter.navigate(0);
    expect(browser.startBrowserTracingNavigationSpan).not.toHaveBeenCalled();
  });

  it('creates navigation span when client instrumentation API is not enabled', () => {
    // Ensure the flag is not set (default state - instrumentation API not used)
    delete (globalThis as any).__sentryReactRouterClientInstrumentationUsed;

    instrumentHydratedRouter();
    mockRouter.navigate('/bar');

    // Should create a navigation span because instrumentation API is not handling it
    expect(browser.startBrowserTracingNavigationSpan).toHaveBeenCalled();
  });

  it('creates navigation span in Framework Mode (flag not set means router() was never called)', () => {
    // This is a regression test for Framework Mode (e.g., Remix) where:
    // 1. createSentryClientInstrumentation() may be called during SDK init
    // 2. But the framework doesn't invoke the instrumentations API, so router() is never called
    // 3. In this case, the legacy navigation instrumentation should still create spans
    //
    // We simulate this by ensuring the flag is NOT set (since router() was never called)

    // Ensure the flag is NOT set (simulating that router() was never called)
    delete (globalThis as any).__sentryReactRouterClientInstrumentationUsed;

    instrumentHydratedRouter();
    mockRouter.navigate('/bar');

    // Should create a navigation span via legacy instrumentation because
    // the instrumentation API's router() method was never called
    expect(browser.startBrowserTracingNavigationSpan).toHaveBeenCalled();
  });

  it('should warn when router is not found after max retries', () => {
    vi.useFakeTimers();

    // Remove the router to simulate it not being available
    delete (globalThis as any).__reactRouterDataRouter;

    instrumentHydratedRouter();

    // Advance timers past MAX_RETRIES (40 retries × 50ms = 2000ms)
    vi.advanceTimersByTime(2100);

    expect(core.debug.warn).toHaveBeenCalledWith(
      'Unable to instrument React Router: router not found after hydration.',
    );

    vi.useRealTimers();
  });
});
