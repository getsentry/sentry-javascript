import * as SentryBrowser from '@sentry/browser';
import { URL_TEMPLATE } from '@sentry/conventions/attributes';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, SEMANTIC_ATTRIBUTE_SENTRY_SOURCE } from '@sentry/core/browser';
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

const mockPageloadSpan = {
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
    (SentryBrowser.WINDOW as any).location = { pathname: '/posts/999', search: '' };

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
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.pageload.react.tanstack_router',
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
        [URL_TEMPLATE]: '/posts/$postId',
        'url.path.params.postId': '999',
      }),
    });
  });

  describe('pageload route matching', () => {
    // `window.location.pathname` carries the router basepath, but whether `matchRoutes` wants it is
    // version-dependent (newer routers strip it in `parseLocation`, older ones inside `matchRoutes`).
    // `state.location` is always in the form the router itself expects, so we match against that.
    it('matches against the router location, not window.location', () => {
      (SentryBrowser.WINDOW as any).location = { pathname: '/app/posts/999', search: '?q=1' };

      const integration = tanstackRouterBrowserTracingIntegration(
        { ...mockRouter, state: { location: { pathname: '/posts/999', search: { q: 1 } } } },
        { instrumentPageLoad: true, instrumentNavigation: false },
      );

      integration.afterAllSetup!(mockClient as any);

      expect(mockRouter.matchRoutes).toHaveBeenCalledWith('/posts/999', { q: 1 }, expect.any(Object));
      expect(mockRouter.options.parseSearch).not.toHaveBeenCalled();
    });

    it('falls back to window.location when the router exposes no location', () => {
      (SentryBrowser.WINDOW as any).location = { pathname: '/posts/999', search: '?q=1' };

      const integration = tanstackRouterBrowserTracingIntegration(mockRouter, {
        instrumentPageLoad: true,
        instrumentNavigation: false,
      });

      integration.afterAllSetup!(mockClient as any);

      expect(mockRouter.options.parseSearch).toHaveBeenCalledWith('?q=1');
      expect(mockRouter.matchRoutes).toHaveBeenCalledWith('/posts/999', {}, expect.any(Object));
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
        'url.path.params.postId': '2',
        'url.path.parameter.postId': '2',
        'params.postId': '2',
      }),
    );
  });
});
