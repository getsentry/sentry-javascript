import * as SentryBrowser from '@sentry/browser';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, SEMANTIC_ATTRIBUTE_SENTRY_SOURCE } from '@sentry/core';
import type { AnyRouter } from '@tanstack/vue-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tanstackRouterBrowserTracingIntegration } from '../src/tanstackrouter';

vi.mock('@sentry/browser', async () => {
  const actual = await vi.importActual('@sentry/browser');
  return {
    ...actual,
    WINDOW: {
      location: {
        pathname: '/test/123',
        search: '?foo=bar',
      },
    },
  };
});

const startBrowserTracingPageLoadSpanSpy = vi.spyOn(SentryBrowser, 'startBrowserTracingPageLoadSpan');
const startBrowserTracingNavigationSpanSpy = vi.spyOn(SentryBrowser, 'startBrowserTracingNavigationSpan');

const mockNavigationSpan = {
  updateName: vi.fn(),
  setAttribute: vi.fn(),
  setAttributes: vi.fn(),
};

describe('tanstackRouterBrowserTracingIntegration', () => {
  const mockMatchedRoutes = [
    {
      routeId: '/test/:id',
      pathname: '/test/123',
      params: { id: '123' },
    },
  ];

  const mockRouter: Partial<AnyRouter> = {
    options: {
      parseSearch: vi.fn((search: string) => {
        const params = new URLSearchParams(search);
        const result: Record<string, unknown> = {};
        params.forEach((value, key) => {
          result[key] = value;
        });
        return result;
      }),
    } as AnyRouter['options'],
    matchRoutes: vi.fn(() => mockMatchedRoutes),
    subscribe: vi.fn(() => vi.fn()), // Return an unsubscribe function
  };

  const mockClient = {
    on: vi.fn(),
    emit: vi.fn(),
    getOptions: vi.fn(() => ({})),
    addEventProcessor: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    startBrowserTracingNavigationSpanSpy.mockReturnValue(mockNavigationSpan as any);

    // Mock window.location
    vi.stubGlobal('window', {
      location: {
        pathname: '/test/123',
        search: '?foo=bar',
      },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('creates an integration with the correct name', () => {
    const integration = tanstackRouterBrowserTracingIntegration(mockRouter);
    expect(integration.name).toBe('BrowserTracing');
  });

  it('instruments pageload on setup', () => {
    const integration = tanstackRouterBrowserTracingIntegration(mockRouter, {
      instrumentPageLoad: true,
    });

    integration.afterAllSetup(mockClient as any);

    expect(mockRouter.matchRoutes).toHaveBeenCalledWith(
      '/test/123',
      { foo: 'bar' },
      {
        preload: false,
        throwOnError: false,
      },
    );

    expect(startBrowserTracingPageLoadSpanSpy).toHaveBeenCalledTimes(1);
    expect(startBrowserTracingPageLoadSpanSpy).toHaveBeenCalledWith(mockClient, {
      name: '/test/:id',
      attributes: expect.objectContaining({
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.pageload.vue.tanstack_router',
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
        'url.path.parameter.id': '123',
        'params.id': '123',
      }),
    });
  });

  it('does not instrument pageload when instrumentPageLoad is false', () => {
    const integration = tanstackRouterBrowserTracingIntegration(mockRouter, {
      instrumentPageLoad: false,
    });

    integration.afterAllSetup(mockClient as any);

    expect(startBrowserTracingPageLoadSpanSpy).not.toHaveBeenCalled();
  });

  it('subscribes to router navigation events when instrumentNavigation is true', () => {
    const integration = tanstackRouterBrowserTracingIntegration(mockRouter, {
      instrumentNavigation: true,
    });

    integration.afterAllSetup(mockClient as any);

    expect(mockRouter.subscribe).toHaveBeenCalledWith('onBeforeNavigate', expect.any(Function));
  });

  it('does not subscribe to navigation events when instrumentNavigation is false', () => {
    const integration = tanstackRouterBrowserTracingIntegration(mockRouter, {
      instrumentNavigation: false,
    });

    integration.afterAllSetup(mockClient as any);

    // Only pageload should have been called
    expect(mockRouter.subscribe).not.toHaveBeenCalled();
  });

  it('creates navigation spans with correct attributes', () => {
    const integration = tanstackRouterBrowserTracingIntegration(mockRouter, {
      instrumentNavigation: true,
      instrumentPageLoad: false, // Disable pageload to isolate navigation test
    });

    integration.afterAllSetup(mockClient as any);

    // Get the onBeforeNavigate callback
    const onBeforeNavigateCallback = (mockRouter.subscribe as any).mock.calls.find(
      (call: [string, (...args: any[]) => void]) => call[0] === 'onBeforeNavigate',
    )?.[1];

    expect(onBeforeNavigateCallback).toBeDefined();

    // Simulate navigation
    onBeforeNavigateCallback({
      toLocation: {
        pathname: '/test/456',
        search: {},
        state: 'state-1',
      },
      fromLocation: {
        pathname: '/test/123',
        search: {},
        state: 'state-0',
      },
    });

    expect(startBrowserTracingNavigationSpanSpy).toHaveBeenCalledTimes(1);
    expect(startBrowserTracingNavigationSpanSpy).toHaveBeenCalledWith(mockClient, {
      name: '/test/:id',
      attributes: expect.objectContaining({
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.vue.tanstack_router',
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
      }),
    });
  });

  it('skips navigation span creation when state is the same', () => {
    const integration = tanstackRouterBrowserTracingIntegration(mockRouter, {
      instrumentNavigation: true,
      instrumentPageLoad: false,
    });

    integration.afterAllSetup(mockClient as any);

    const onBeforeNavigateCallback = (mockRouter.subscribe as any).mock.calls.find(
      (call: [string, (...args: any[]) => void]) => call[0] === 'onBeforeNavigate',
    )?.[1];

    // Simulate navigation with same state (e.g., during pageload)
    onBeforeNavigateCallback({
      toLocation: {
        pathname: '/test/456',
        search: {},
        state: 'same-state',
      },
      fromLocation: {
        pathname: '/test/123',
        search: {},
        state: 'same-state',
      },
    });

    expect(startBrowserTracingNavigationSpanSpy).not.toHaveBeenCalled();
  });

  it('updates navigation span on redirect using onResolved', () => {
    const integration = tanstackRouterBrowserTracingIntegration(mockRouter, {
      instrumentNavigation: true,
      instrumentPageLoad: false,
    });

    integration.afterAllSetup(mockClient as any);

    const onBeforeNavigateCallback = (mockRouter.subscribe as any).mock.calls.find(
      (call: [string, (...args: any[]) => void]) => call[0] === 'onBeforeNavigate',
    )?.[1];

    // Simulate navigation
    onBeforeNavigateCallback({
      toLocation: {
        pathname: '/test/456',
        search: {},
        state: 'state-1',
      },
      fromLocation: {
        pathname: '/test/123',
        search: {},
        state: 'state-0',
      },
    });

    // Get the onResolved callback that was registered
    const onResolvedCallback = (mockRouter.subscribe as any).mock.calls.find(
      (call: [string, (...args: any[]) => void]) => call[0] === 'onResolved',
    )?.[1];

    expect(onResolvedCallback).toBeDefined();

    // Mock different matched routes for the redirect
    const redirectedMatchedRoutes = [
      {
        routeId: '/redirected/:id',
        pathname: '/redirected/789',
        params: { id: '789' },
      },
    ];

    (mockRouter.matchRoutes as any).mockReturnValueOnce(redirectedMatchedRoutes);

    // Simulate redirect resolution
    onResolvedCallback({
      toLocation: {
        pathname: '/redirected/789',
        search: {},
      },
    });

    expect(mockNavigationSpan.updateName).toHaveBeenCalledWith('/redirected/:id');
    expect(mockNavigationSpan.setAttribute).toHaveBeenCalledWith(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'route');
    expect(mockNavigationSpan.setAttributes).toHaveBeenCalledWith({
      'url.path.parameter.id': '789',
      'params.id': '789',
    });
  });
});
