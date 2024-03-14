import { WINDOW } from '@sentry/react';
import type { Client } from '@sentry/types';
import { JSDOM } from 'jsdom';
import type { NEXT_DATA } from 'next/dist/shared/lib/utils';
import Router from 'next/router';

import {
  pagesRouterInstrumentNavigation,
  pagesRouterInstrumentPageLoad,
} from '../../src/client/routing/pagesRouterRoutingInstrumentation';

const globalObject = WINDOW as typeof WINDOW & {
  __BUILD_MANIFEST?: {
    sortedPages?: string[];
  };
};

const originalBuildManifest = globalObject.__BUILD_MANIFEST;
const originalBuildManifestRoutes = globalObject.__BUILD_MANIFEST?.sortedPages;

let eventHandlers: { [eventName: string]: Set<(...args: any[]) => void> } = {};

jest.mock('next/router', () => {
  return {
    default: {
      events: {
        on(type: string, handler: (...args: any[]) => void) {
          if (!eventHandlers[type]) {
            eventHandlers[type] = new Set();
          }

          eventHandlers[type].add(handler);
        },
        off: jest.fn((type: string, handler: (...args: any[]) => void) => {
          if (eventHandlers[type]) {
            eventHandlers[type].delete(handler);
          }
        }),
        emit(type: string, ...eventArgs: any[]) {
          if (eventHandlers[type]) {
            eventHandlers[type].forEach(eventHandler => {
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
    jest.clearAllMocks();
  });

  it.each([
    [
      'https://example.com/lforst/posts/1337?q=42',
      '/[user]/posts/[id]',
      { user: 'lforst', id: '1337', q: '42' },
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
          'sentry.source': 'route',
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
          'sentry.source': 'route',
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
          'sentry.source': 'route',
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
          'sentry.source': 'url',
        },
      },
    ],
  ])(
    'creates a pageload transaction (#%#)',
    (url, route, query, props, hasNextData, expectedStartTransactionArgument) => {
      setUpNextPage({ url, route, query, props, hasNextData });

      const emit = jest.fn();
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
    jest.clearAllMocks();
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

      const emit = jest.fn();
      const client = {
        emit,
        getOptions: () => ({}),
      } as unknown as Client;

      pagesRouterInstrumentNavigation(client);

      Router.events.emit('routeChangeStart', targetLocation);

      expect(emit).toHaveBeenCalledTimes(1);
      expect(emit).toHaveBeenCalledWith(
        'startNavigationSpan',
        expect.objectContaining({
          name: expectedTransactionName,
          attributes: {
            'sentry.op': 'navigation',
            'sentry.origin': 'auto.navigation.nextjs.pages_router_instrumentation',
            'sentry.source': expectedTransactionSource,
          },
        }),
      );
    },
  );
});
