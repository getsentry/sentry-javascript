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
