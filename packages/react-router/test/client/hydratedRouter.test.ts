import * as browser from '@sentry/browser';
import * as core from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { instrumentHydratedRouter } from '../../src/client/hydratedRouter';

vi.mock('@sentry/core', async () => {
  const actual = await vi.importActual<any>('@sentry/core');
  return {
    ...actual,
    getActiveSpan: vi.fn(),
    getRootSpan: vi.fn(),
    spanToJSON: vi.fn(),
    getClient: vi.fn(),
    debug: {
      warn: vi.fn(),
    },
    SEMANTIC_ATTRIBUTE_SENTRY_OP: 'op',
    SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN: 'origin',
    SEMANTIC_ATTRIBUTE_SENTRY_SOURCE: 'source',
    GLOBAL_OBJ: globalThis,
  };
});
vi.mock('@sentry/browser', () => ({
  startBrowserTracingNavigationSpan: vi.fn(),
}));

describe('instrumentHydratedRouter', () => {
  let originalRouter: any;
  let mockRouter: any;
  let mockPageloadSpan: any;
  let mockNavigationSpan: any;

  beforeEach(() => {
    originalRouter = (globalThis as any).__reactRouterDataRouter;
    mockRouter = {
      state: {
        location: { pathname: '/foo/bar' },
        matches: [{ route: { path: '/foo/:id' } }],
      },
      navigate: vi.fn(),
      subscribe: vi.fn(),
    };
    (globalThis as any).__reactRouterDataRouter = mockRouter;

    mockPageloadSpan = { updateName: vi.fn(), setAttributes: vi.fn() };
    mockNavigationSpan = { updateName: vi.fn(), setAttributes: vi.fn() };

    (core.getActiveSpan as any).mockReturnValue(mockPageloadSpan);
    (core.getRootSpan as any).mockImplementation((span: any) => span);
    (core.spanToJSON as any).mockImplementation((_span: any) => ({
      description: '/foo/bar',
      op: 'pageload',
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
    expect(mockNavigationSpan.updateName).toHaveBeenCalled();
    expect(mockNavigationSpan.setAttributes).toHaveBeenCalled();
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
    // 2. But the framework doesn't support unstable_instrumentations, so router() is never called
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
