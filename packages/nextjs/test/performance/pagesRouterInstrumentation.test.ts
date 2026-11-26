import type { Client } from '@sentry/core';
import { WINDOW } from '@sentry/react';
import { JSDOM } from 'jsdom';
import type { NEXT_DATA } from 'next/dist/shared/lib/utils';
import Router from 'next/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pagesRouterInstrumentPageLoad } from '../../src/client/routing/pagesRouterRoutingInstrumentation';
import { pagesRouterInstrumentNavigation } from '../../src/client/routing/pagesRouterNavigationInstrumentation';
import { URL_TEMPLATE } from '@sentry/conventions/attributes';

const globalObject = WINDOW as typeof WINDOW & {
  __BUILD_MANIFEST?: {
    sortedPages?: string[];
  };
};

const originalBuildManifest = globalObject.__BUILD_MANIFEST;
const originalBuildManifestRoutes = globalObject.__BUILD_MANIFEST?.sortedPages;

let eventHandlers: { [eventName: string]: Set<(...args: any[]) => void> } = {};

vi.mock('next/router', () => {
  return {
    default: {
      events: {
        on(type: string, handler: (...args: any[]) => void) {
          if (!eventHandlers[type]) {
            eventHandlers[type] = new Set();
          }

          eventHandlers[type]!.add(handler);
        },
        off: vi.fn((type: string, handler: (...args: any[]) => void) => {
          if (eventHandlers[type]) {
            eventHandlers[type]!.delete(handler);
          }
        }),
        emit(type: string, ...eventArgs: any[]) {
          if (eventHandlers[type]) {
            eventHandlers[type]!.forEach(eventHandler => {
              eventHandler(...eventArgs);
            });
          }
        },
      },
    },
  };
});

describe('pagesRouterInstrumentPageLoad', () => {
  const originalGlobalDocument = WINDOW.document;
  const originalGlobalLocation = WINDOW.location;

  function setUpNextPage(pageProperties: {
    url: string;
    route: string;
    query?: any;
    props?: any;
    navigatableRoutes?: string[];
    hasNextData: boolean;
    head?: string;
  }) {
    const nextDataContent: NEXT_DATA = {
      props: pageProperties.props,
      page: pageProperties.route,
      query: pageProperties.query,
      buildId: 'y76hvndNJBAithejdVGLW',
      isFallback: false,
      gssp: true,
      appGip: true,
      scriptLoader: [],
    };

    const dom = new JSDOM(
      // Just an example of what a __NEXT_DATA__ tag might look like
      pageProperties.hasNextData
        ? `<head>${pageProperties.head ?? ''}</head><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextDataContent)}</script></body>`
        : '<body><h1>No next data :(</h1></body>',
      { url: pageProperties.url },
    );

    // The Next.js routing instrumentations requires a few things to be present on pageload:
    // 1. Access to window.document API for `window.document.getElementById`
    // 2. Access to window.location API for `window.location.pathname`
    Object.defineProperty(WINDOW, 'document', { value: dom.window.document, writable: true });
    Object.defineProperty(WINDOW, 'location', { value: dom.window.document.location, writable: true });

    // Define Next.js clientside build manifest with navigatable routes
    globalObject.__BUILD_MANIFEST = {
      ...globalObject.__BUILD_MANIFEST,
      sortedPages: pageProperties.navigatableRoutes as string[],
    };
  }

  afterEach(() => {
    // Clean up JSDom
    Object.defineProperty(WINDOW, 'document', { value: originalGlobalDocument });
    Object.defineProperty(WINDOW, 'location', { value: originalGlobalLocation });

    // Reset Next.js' __BUILD_MANIFEST
    globalObject.__BUILD_MANIFEST = originalBuildManifest;
    if (globalObject.__BUILD_MANIFEST) {
      globalObject.__BUILD_MANIFEST.sortedPages = originalBuildManifestRoutes as string[];
    }

    // Clear all event handlers
    eventHandlers = {};

    // Necessary to clear all Router.events.off() mock call numbers
    vi.clearAllMocks();
  });

  it.each([
    [
      'https://example.com/chargome/posts/1337?q=42',
      '/[user]/posts/[id]',
      { user: 'chargome', id: '1337', q: '42' },
      {
        pageProps: {
          _sentryTraceData: 'c82b8554881b4d28ad977de04a4fb40a-a755953cd3394d5f-1',
          _sentryBaggage: 'other=vendor,foo=bar,third=party,last=item,sentry-release=2.1.0,sentry-environment=myEnv',
        },
      },
      true,
      {
        name: '/[user]/posts/[id]',
        attributes: {
          'sentry.op': 'pageload',
          'sentry.origin': 'auto.pageload.nextjs.pages_router_instrumentation',
          'sentry.segment.name.source': 'route',
          [URL_TEMPLATE]: '/[user]/posts/[id]',
          user: 'chargome',
          id: '1337',
          q: '42',
        },
      },
    ],
    [
      'https://example.com/some-page',
      '/some-page',
      {},
      {
        pageProps: {
          _sentryTraceData: 'c82b8554881b4d28ad977de04a4fb40a-a755953cd3394d5f-1',
          _sentryBaggage: 'other=vendor,foo=bar,third=party,last=item,sentry-release=2.1.0,sentry-environment=myEnv',
        },
      },
      true,
      {
        name: '/some-page',
        attributes: {
          'sentry.op': 'pageload',
          'sentry.origin': 'auto.pageload.nextjs.pages_router_instrumentation',
          'sentry.segment.name.source': 'route',
          [URL_TEMPLATE]: '/some-page',
        },
      },
    ],
    [
      'https://example.com/',
      '/',
      {},
      {},
      true,
      {
        name: '/',
        attributes: {
          'sentry.op': 'pageload',
          'sentry.origin': 'auto.pageload.nextjs.pages_router_instrumentation',
          'sentry.segment.name.source': 'route',
          [URL_TEMPLATE]: '/',
        },
      },
    ],
    [
      'https://example.com/lforst/posts/1337?q=42',
      '/',
      {},
      {},
      false, // no __NEXT_DATA__ tag
      {
        name: '/lforst/posts/1337',
        attributes: {
          'sentry.op': 'pageload',
          'sentry.origin': 'auto.pageload.nextjs.pages_router_instrumentation',
          'sentry.segment.name.source': 'url',
        },
      },
    ],
  ])(
    'creates a pageload transaction (#%#)',
    (url, route, query, props, hasNextData, expectedStartTransactionArgument) => {
      setUpNextPage({ url, route, query, props, hasNextData });

      const emit = vi.fn();
      const client = {
        emit,
        getOptions: () => ({}),
      } as unknown as Client;

      pagesRouterInstrumentPageLoad(client);

      const sentryTrace = (props as any).pageProps?._sentryTraceData;
      const baggage = (props as any).pageProps?._sentryBaggage;

      expect(emit).toHaveBeenCalledTimes(1);
      expect(emit).toHaveBeenCalledWith(
        'startPageLoadSpan',
        expect.objectContaining(expectedStartTransactionArgument),
        {
          sentryTrace,
          baggage,
        },
      );
    },
  );

  describe('with trace meta tags in the document', () => {
    const SERVER_TRACE_ID = 'c82b8554881b4d28ad977de04a4fb40a';
    const FOREIGN_TRACE_ID = '12345678901234567890123456789012';
    const nextDataTrace = {
      sentryTrace: `${SERVER_TRACE_ID}-a755953cd3394d5f-1`,
      baggage: `sentry-trace_id=${SERVER_TRACE_ID},sentry-release=2.1.0,sentry-environment=myEnv`,
    };
    // Next.js renders these for the request, with the span that was active while the document rendered.
    const serverMetaTags = `<meta name="sentry-trace" content="${SERVER_TRACE_ID}-b855953cd3394d5f-1"><meta name="baggage" content="sentry-trace_id=${SERVER_TRACE_ID},sentry-release=2.1.0">`;
    const foreignTrace = {
      sentryTrace: `${FOREIGN_TRACE_ID}-1234567890123456-1`,
      baggage: `sentry-trace_id=${FOREIGN_TRACE_ID},sentry-release=mobile`,
    };
    const foreignMetaTags = `<meta name="sentry-trace" content="${foreignTrace.sentryTrace}"><meta name="baggage" content="${foreignTrace.baggage}">`;

    function instrumentPageLoad(
      head: string,
      pageProps: Record<string, unknown> = {
        _sentryTraceData: nextDataTrace.sentryTrace,
        _sentryBaggage: nextDataTrace.baggage,
      },
      route = '/some-page',
    ): ReturnType<typeof vi.fn> {
      setUpNextPage({ url: 'https://example.com/some-page', route, props: { pageProps }, hasNextData: true, head });
      const emit = vi.fn();
      pagesRouterInstrumentPageLoad({ emit, getOptions: () => ({}) } as unknown as Client);
      return emit;
    }

    it.each([
      ['before the meta tags of the server', `${foreignMetaTags}${serverMetaTags}`],
      ['after the meta tags of the server', `${serverMetaTags}${foreignMetaTags}`],
      ['without meta tags of the server', foreignMetaTags],
    ])('continues the trace of meta tags that belong to another trace, %s', (_, head) => {
      const emit = instrumentPageLoad(head);

      expect(emit).toHaveBeenCalledTimes(1);
      expect(emit).toHaveBeenCalledWith(
        'startPageLoadSpan',
        expect.objectContaining({ name: '/some-page' }),
        foreignTrace,
      );
    });

    it.each([
      ['the meta tags of the server', serverMetaTags],
      ['an empty `sentry-trace` meta tag', '<meta name="sentry-trace" content="">'],
      ['a `sentry-trace` meta tag without content', '<meta name="sentry-trace">'],
      ['an invalid `sentry-trace` meta tag', '<meta name="sentry-trace" content="not-a-trace">'],
      [
        'a `sentry-trace` meta tag of another trace without its baggage',
        `${serverMetaTags}<meta name="sentry-trace" content="${foreignTrace.sentryTrace}">`,
      ],
      ['only a `baggage` meta tag of another trace', `<meta name="baggage" content="${foreignTrace.baggage}">`],
      ['unrelated meta tags', '<meta name="viewport" content="width=device-width">'],
    ])('keeps the `__NEXT_DATA__` trace with %s', (_, head) => {
      const emit = instrumentPageLoad(head);

      expect(emit).toHaveBeenCalledWith('startPageLoadSpan', expect.anything(), nextDataTrace);
    });

    describe('when `__NEXT_DATA__` has no trace', () => {
      const noTrace = { sentryTrace: undefined, baggage: undefined };

      function setServerTimingTrace(sentryTrace: string): void {
        vi.spyOn(performance, 'getEntriesByType').mockReturnValue([
          {
            serverTiming: [{ name: 'sentry-trace', description: sentryTrace, duration: 0 }],
          } as unknown as PerformanceEntry,
        ]);
      }

      afterEach(() => {
        vi.restoreAllMocks();
      });

      it('continues the trace of meta tags that belong to another trace than the `Server-Timing` header', () => {
        setServerTimingTrace(nextDataTrace.sentryTrace);
        const emit = instrumentPageLoad(`${serverMetaTags}${foreignMetaTags}`, {});

        expect(emit).toHaveBeenCalledWith('startPageLoadSpan', expect.anything(), foreignTrace);
      });

      it('leaves the meta tags of the server to the browser SDK', () => {
        setServerTimingTrace(nextDataTrace.sentryTrace);
        const emit = instrumentPageLoad(serverMetaTags, {});

        expect(emit).toHaveBeenCalledWith('startPageLoadSpan', expect.anything(), noTrace);
      });

      it('leaves the meta tags to the browser SDK without a `Server-Timing` header', () => {
        const emit = instrumentPageLoad(`${serverMetaTags}${foreignMetaTags}`, {});

        expect(emit).toHaveBeenCalledWith('startPageLoadSpan', expect.anything(), noTrace);
      });
    });

    it('still names an `/_error` pageload after the `__NEXT_DATA__` baggage', () => {
      const emit = instrumentPageLoad(
        foreignMetaTags,
        { _sentryTraceData: nextDataTrace.sentryTrace, _sentryBaggage: 'sentry-transaction=GET /users/[id]' },
        '/_error',
      );

      expect(emit).toHaveBeenCalledWith(
        'startPageLoadSpan',
        expect.objectContaining({ name: '/users/[id]' }),
        foreignTrace,
      );
    });
  });
});

describe('pagesRouterInstrumentNavigation', () => {
  const originalGlobalDocument = WINDOW.document;
  const originalGlobalLocation = WINDOW.location;

  function setUpNextPage(pageProperties: {
    url: string;
    route: string;
    query?: any;
    props?: any;
    navigatableRoutes?: string[];
    hasNextData: boolean;
  }) {
    const nextDataContent: NEXT_DATA = {
      props: pageProperties.props,
      page: pageProperties.route,
      query: pageProperties.query,
      buildId: 'y76hvndNJBAithejdVGLW',
      isFallback: false,
      gssp: true,
      appGip: true,
      scriptLoader: [],
    };

    const dom = new JSDOM(
      // Just an example of what a __NEXT_DATA__ tag might look like
      pageProperties.hasNextData
        ? `<body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextDataContent)}</script></body>`
        : '<body><h1>No next data :(</h1></body>',
      { url: pageProperties.url },
    );

    // The Next.js routing instrumentations requires a few things to be present on pageload:
    // 1. Access to window.document API for `window.document.getElementById`
    // 2. Access to window.location API for `window.location.pathname`
    Object.defineProperty(WINDOW, 'document', { value: dom.window.document, writable: true });
    Object.defineProperty(WINDOW, 'location', { value: dom.window.document.location, writable: true });

    // Define Next.js clientside build manifest with navigatable routes
    globalObject.__BUILD_MANIFEST = {
      ...globalObject.__BUILD_MANIFEST,
      sortedPages: pageProperties.navigatableRoutes as string[],
    };
  }

  afterEach(() => {
    // Clean up JSDom
    Object.defineProperty(WINDOW, 'document', { value: originalGlobalDocument });
    Object.defineProperty(WINDOW, 'location', { value: originalGlobalLocation });

    // Reset Next.js' __BUILD_MANIFEST
    globalObject.__BUILD_MANIFEST = originalBuildManifest;
    if (globalObject.__BUILD_MANIFEST) {
      globalObject.__BUILD_MANIFEST.sortedPages = originalBuildManifestRoutes as string[];
    }

    // Clear all event handlers
    eventHandlers = {};

    // Necessary to clear all Router.events.off() mock call numbers
    vi.clearAllMocks();
  });

  it.each([
    ['/news', '/news', 'route'],
    ['/news/', '/news', 'route'],
    ['/some-route-that-is-not-defined-12332', '/some-route-that-is-not-defined-12332', 'url'], // unknown route
    ['/some-route-that-is-not-defined-12332?q=42', '/some-route-that-is-not-defined-12332', 'url'], // unknown route w/ query param
    ['/posts/42', '/posts/[id]', 'route'],
    ['/posts/42/', '/posts/[id]', 'route'],
    ['/posts/42?someParam=1', '/posts/[id]', 'route'], // query params are ignored
    ['/posts/42/details', '/posts/[id]/details', 'route'],
    ['/users/1337/friends/closeby/good', '/users/[id]/friends/[...filters]', 'route'],
    ['/users/1337/friends', '/users/1337/friends', 'url'],
    ['/statistics/page-visits', '/statistics/[[...parameters]]', 'route'],
    ['/statistics', '/statistics/[[...parameters]]', 'route'],
    ['/a/b/c/d', '/[a]/b/[c]/[...d]', 'route'],
    ['/a/b/c/d/e', '/[a]/b/[c]/[...d]', 'route'],
    ['/a/b/c', '/a/b/c', 'url'],
    ['/e/f/g/h', '/e/[f]/[g]/[[...h]]', 'route'],
    ['/e/f/g/h/i', '/e/[f]/[g]/[[...h]]', 'route'],
    ['/e/f/g', '/e/[f]/[g]/[[...h]]', 'route'],
  ])(
    'should create a parameterized transaction on route change (%s)',
    (targetLocation, expectedTransactionName, expectedTransactionSource) => {
      setUpNextPage({
        url: 'https://example.com/home',
        route: '/home',
        hasNextData: true,
        navigatableRoutes: [
          '/home',
          '/news',
          '/posts/[id]',
          '/posts/[id]/details',
          '/users/[id]/friends/[...filters]',
          '/statistics/[[...parameters]]',
          // just some complicated routes to see if we get the matching right
          '/[a]/b/[c]/[...d]',
          '/e/[f]/[g]/[[...h]]',
        ],
      });

      const emit = vi.fn();
      const client = {
        emit,
        getOptions: () => ({}),
        getDataCollectionOptions: () => ({ urlQueryParams: true }),
      } as unknown as Client;

      pagesRouterInstrumentNavigation(client);

      Router.events.emit('routeChangeStart', targetLocation);

      expect(emit).toHaveBeenCalledTimes(2);
      const expectedStartSpanOptions = {
        name: expectedTransactionName,
        attributes: {
          'sentry.op': 'navigation',
          'sentry.origin': 'auto.navigation.nextjs.pages_router_instrumentation',
          'sentry.segment.name.source': expectedTransactionSource,
          ...(expectedTransactionSource === 'route' ? { [URL_TEMPLATE]: expectedTransactionName } : {}),
        },
      };
      expect(emit).toHaveBeenCalledWith(
        'beforeStartNavigationSpan',
        expect.objectContaining(expectedStartSpanOptions),
        {
          isRedirect: undefined,
          url: `https://example.com${targetLocation}`,
        },
      );
      expect(emit).toHaveBeenCalledWith('startNavigationSpan', expect.objectContaining(expectedStartSpanOptions), {
        isRedirect: undefined,
        url: `https://example.com${targetLocation}`,
      });
    },
  );
});
