import { getGlobalObject } from '@sentry/utils';
import { JSDOM } from 'jsdom';
import { NEXT_DATA as NextData } from 'next/dist/next-server/lib/utils';
import { default as Router } from 'next/router';

import { nextRouterInstrumentation } from '../../src/performance/client';

const globalObject = getGlobalObject<
  Window & {
    __BUILD_MANIFEST?: {
      sortedPages?: string[];
    };
  }
>();

const originalBuildManifest = globalObject.__BUILD_MANIFEST;
const originalBuildManifestRoutes = globalObject.__BUILD_MANIFEST?.sortedPages;

jest.mock('next/router', () => {
  const eventHandlers: { [eventName: string]: ((...args: any[]) => void)[] } = {};
  return {
    default: {
      events: {
        on(type: string, handler: (...args: any[]) => void) {
          if (eventHandlers[type]) {
            eventHandlers[type].push(handler);
          } else {
            eventHandlers[type] = [handler];
          }
        },
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

describe('nextRouterInstrumentation', () => {
  const originalGlobalDocument = getGlobalObject<Window>().document;
  const originalGlobalLocation = getGlobalObject<Window>().location;

  function setUpNextPage(pageProperties: {
    url: string;
    route: string;
    query?: any;
    props?: any;
    navigatableRoutes?: string[];
    hasNextData: boolean;
  }) {
    const nextDataContent: NextData = {
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
    Object.defineProperty(global, 'document', { value: dom.window.document, writable: true });
    Object.defineProperty(global, 'location', { value: dom.window.document.location, writable: true });

    // Define Next.js clientside build manifest with navigatable routes
    (global as any).__BUILD_MANIFEST = {
      ...(global as any).__BUILD_MANIFEST,
      sortedPages: pageProperties.navigatableRoutes,
    };
  }

  afterEach(() => {
    // Clean up JSDom
    Object.defineProperty(global, 'document', { value: originalGlobalDocument });
    Object.defineProperty(global, 'location', { value: originalGlobalLocation });

    // Reset Next.js' __BUILD_MANIFEST
    (global as any).__BUILD_MANIFEST = originalBuildManifest;
    if ((global as any).__BUILD_MANIFEST) {
      (global as any).__BUILD_MANIFEST.sortedPages = originalBuildManifestRoutes;
    }
  });

  describe('pageload transactions', () => {
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
          op: 'pageload',
          tags: {
            'routing.instrumentation': 'next-router',
          },
          metadata: {
            source: 'route',
            baggage: [{ environment: 'myEnv', release: '2.1.0' }, '', true],
          },
          traceId: 'c82b8554881b4d28ad977de04a4fb40a',
          parentSpanId: 'a755953cd3394d5f',
          parentSampled: true,
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
          op: 'pageload',
          tags: {
            'routing.instrumentation': 'next-router',
          },
          metadata: {
            source: 'route',
            baggage: [{ environment: 'myEnv', release: '2.1.0' }, '', true],
          },
          traceId: 'c82b8554881b4d28ad977de04a4fb40a',
          parentSpanId: 'a755953cd3394d5f',
          parentSampled: true,
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
          op: 'pageload',
          tags: {
            'routing.instrumentation': 'next-router',
          },
          metadata: {
            source: 'route',
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
          op: 'pageload',
          tags: {
            'routing.instrumentation': 'next-router',
          },
          metadata: {
            source: 'url',
          },
        },
      ],
    ])(
      'creates a pageload transaction (#%#)',
      (url, route, query, props, hasNextData, expectedStartTransactionArgument) => {
        const mockStartTransaction = jest.fn();
        setUpNextPage({ url, route, query, props, hasNextData });
        nextRouterInstrumentation(mockStartTransaction);
        expect(mockStartTransaction).toHaveBeenCalledTimes(1);
        expect(mockStartTransaction).toHaveBeenLastCalledWith(expectedStartTransactionArgument);
      },
    );

    it('does not create a pageload transaction if option not given', () => {
      const mockStartTransaction = jest.fn();
      setUpNextPage({ url: 'https://example.com/', route: '/', hasNextData: false });
      nextRouterInstrumentation(mockStartTransaction, false);
      expect(mockStartTransaction).toHaveBeenCalledTimes(0);
    });
  });

  describe('new navigation transactions', () => {
    it.each([
      ['/news', '/news', 'route'],
      ['/news/', '/news', 'route'],
      ['/some-route-that-is-not-defined-12332', '/some-route-that-is-not-defined-12332', 'url'], // unknown route
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
        const mockStartTransaction = jest.fn();

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

        nextRouterInstrumentation(mockStartTransaction, false, true);

        Router.events.emit('routeChangeStart', targetLocation);

        expect(mockStartTransaction).toHaveBeenCalledTimes(1);
        expect(mockStartTransaction).toHaveBeenCalledWith(
          expect.objectContaining({
            name: expectedTransactionName,
            op: 'navigation',
            tags: expect.objectContaining({
              'routing.instrumentation': 'next-router',
            }),
            metadata: expect.objectContaining({
              source: expectedTransactionSource,
            }),
          }),
        );
      },
    );

    it('should not create transaction when navigation transactions are disabled', () => {
      const mockStartTransaction = jest.fn();

      setUpNextPage({
        url: 'https://example.com/home',
        route: '/home',
        hasNextData: true,
        navigatableRoutes: ['/home', '/posts/[id]'],
      });

      nextRouterInstrumentation(mockStartTransaction, false, false);

      Router.events.emit('routeChangeStart', '/posts/42');

      expect(mockStartTransaction).not.toHaveBeenCalled();
    });
  });
});
