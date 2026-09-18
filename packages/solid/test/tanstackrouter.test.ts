import * as SentryBrowser from '@sentry/browser';
import { SENTRY_SEGMENT_NAME_SOURCE, URL_TEMPLATE } from '@sentry/conventions/attributes';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tanstackRouterBrowserTracingIntegration } from '../src/tanstackrouter';

vi.mock('@sentry/browser', async () => {
  const actual = await vi.importActual('@sentry/browser');
  return {
    ...actual,
    WINDOW: {
      location: {
        pathname: '/posts/999',
        search: '',
      },
    },
  };
});

const startBrowserTracingPageLoadSpanSpy = vi.spyOn(SentryBrowser, 'startBrowserTracingPageLoadSpan');
const startBrowserTracingNavigationSpanSpy = vi.spyOn(SentryBrowser, 'startBrowserTracingNavigationSpan');

const mockPageloadSpan = {
  updateName: vi.fn(),
  setAttribute: vi.fn(),
  setAttributes: vi.fn(),
};

const mockNavigationSpan = {
  updateName: vi.fn(),
  setAttribute: vi.fn(),
  setAttributes: vi.fn(),
};

describe('tanstackRouterBrowserTracingIntegration', () => {
  const mockMatchedRoutes = [
    {
      routeId: '/posts/$postId',
      pathname: '/posts/999',
      params: { postId: '999' },
    },
  ];

  const mockRouter = {
    options: {
      parseSearch: vi.fn(() => ({})),
      stringifySearch: vi.fn(() => ''),
    },
    matchRoutes: vi.fn(() => mockMatchedRoutes),
    subscribe: vi.fn(() => vi.fn()),
  };

  const mockClient = {
    on: vi.fn(),
    emit: vi.fn(),
    getOptions: vi.fn(() => ({})),
    addEventProcessor: vi.fn(),
  };

  const getSubscribeCallback = (eventType: string): ((...args: any[]) => void) =>
    (mockRouter.subscribe as any).mock.calls.find(
      (call: [string, (...args: any[]) => void]) => call[0] === eventType,
    )?.[1];

  beforeEach(() => {
    vi.clearAllMocks();
    startBrowserTracingPageLoadSpanSpy.mockReturnValue(mockPageloadSpan as any);
    startBrowserTracingNavigationSpanSpy.mockReturnValue(mockNavigationSpan as any);

    vi.stubGlobal('window', {
      location: {
        pathname: '/posts/999',
        search: '',
      },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('instruments pageload on setup', () => {
    const integration = tanstackRouterBrowserTracingIntegration(mockRouter, {
      instrumentPageLoad: true,
      instrumentNavigation: false,
    });

    integration.afterAllSetup!(mockClient as any);

    expect(startBrowserTracingPageLoadSpanSpy).toHaveBeenCalledWith(mockClient, {
      name: '/posts/$postId',
      attributes: expect.objectContaining({
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.pageload.solid.tanstack_router',
        [SENTRY_SEGMENT_NAME_SOURCE]: 'route',
        [URL_TEMPLATE]: '/posts/$postId',
        'url.path.parameter.postId': '999',
      }),
    });
  });

  it('updates pageload span URL attributes on redirect to the same route template', () => {
    const integration = tanstackRouterBrowserTracingIntegration(mockRouter, {
      instrumentPageLoad: true,
      instrumentNavigation: false,
    });

    integration.afterAllSetup!(mockClient as any);

    const onResolvedCallback = getSubscribeCallback('onResolved');
    expect(onResolvedCallback).toBeDefined();

    (mockRouter.matchRoutes as any).mockReturnValueOnce([
      {
        routeId: '/posts/$postId',
        pathname: '/posts/2',
        params: { postId: '2' },
      },
    ]);

    onResolvedCallback({
      toLocation: {
        pathname: '/posts/2',
        search: {},
      },
    });

    expect(mockPageloadSpan.setAttributes).toHaveBeenCalledWith(
      expect.objectContaining({
        [URL_TEMPLATE]: '/posts/$postId',
        'url.path': '/posts/2',
        'url.full': expect.any(String),
        'url.path.parameter.postId': '2',
        'params.postId': '2',
      }),
    );
  });

  it('preserves pageload route info when redirect resolves to an unmatched path', () => {
    const integration = tanstackRouterBrowserTracingIntegration(mockRouter, {
      instrumentPageLoad: true,
      instrumentNavigation: false,
    });

    integration.afterAllSetup!(mockClient as any);

    const onResolvedCallback = getSubscribeCallback('onResolved');
    expect(onResolvedCallback).toBeDefined();

    (mockRouter.matchRoutes as any).mockReturnValueOnce([{ routeId: '__root__', params: {} }]);

    onResolvedCallback({
      toLocation: {
        pathname: '/unknown/path',
        search: {},
      },
    });

    expect(mockPageloadSpan.updateName).not.toHaveBeenCalled();
    expect(mockPageloadSpan.setAttribute).not.toHaveBeenCalled();
    expect(mockPageloadSpan.setAttributes).not.toHaveBeenCalled();
  });

  it('clears url.template when a redirect hop no longer matches a route', () => {
    const integration = tanstackRouterBrowserTracingIntegration(mockRouter, {
      instrumentNavigation: true,
      instrumentPageLoad: false,
    });

    integration.afterAllSetup!(mockClient as any);

    const onBeforeLoadCallback = getSubscribeCallback('onBeforeLoad');
    expect(onBeforeLoadCallback).toBeDefined();

    // First hop matches a parameterized route and sets url.template.
    onBeforeLoadCallback({
      toLocation: { pathname: '/posts/456', search: {}, state: 'state-1' },
      fromLocation: { pathname: '/posts/123', search: {}, state: 'state-0' },
    });

    // Redirect continuation lands on a URL with no route match.
    (mockRouter.matchRoutes as any).mockReturnValueOnce([{ routeId: '__root__', params: {} }]);

    onBeforeLoadCallback({
      toLocation: { pathname: '/unknown/path', search: {}, state: 'state-2' },
      fromLocation: { pathname: '/posts/456', search: {}, state: 'state-1' },
    });

    expect(mockNavigationSpan.setAttribute).toHaveBeenLastCalledWith(SENTRY_SEGMENT_NAME_SOURCE, 'url');
    expect(mockNavigationSpan.setAttributes).toHaveBeenLastCalledWith(
      expect.objectContaining({
        [URL_TEMPLATE]: undefined,
        'url.path': '/unknown/path',
        'url.full': expect.any(String),
      }),
    );
  });
});
