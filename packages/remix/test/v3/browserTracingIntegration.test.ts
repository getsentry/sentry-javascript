import type { Client } from '@sentry/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as SentryCore from '@sentry/core';

/** The span a start function returns: records the renames the integration applies. */
function fakeSpan(op: string) {
  return { op, updateName: vi.fn(), setAttributes: vi.fn() };
}
type FakeSpan = ReturnType<typeof fakeSpan>;

let navigationSpan: FakeSpan | undefined;
let activeSpan: FakeSpan | undefined;
let fetchHandler:
  | ((data: {
      fetchData: { url: string };
      headers?: Headers;
      endTimestamp?: number;
      response?: { url: string; headers: Headers };
    }) => void)
  | undefined;

const startBrowserTracingNavigationSpan = vi.fn(() => navigationSpan);
const upstreamIntegration = { name: 'BrowserTracing', afterAllSetup: vi.fn() };
const upstreamOptions: { instrumentNavigation?: boolean }[] = [];

/** What `createCachedRouteProvider` does, in miniature: answers from the routes it was told about. */
const recorded = new Map<string, string>();
const routeProvider = {
  resolveRoute: (url: { pathname: string }) => recorded.get(url.pathname),
  resolveCurrentRoute: () => recorded.get((globalThis as { location?: { pathname: string } }).location?.pathname ?? ''),
  record: (pathname: string | undefined, route: string | undefined) => {
    if (pathname && route) {
      recorded.set(pathname, route);
    }
  },
};
let registeredProvider: typeof routeProvider | undefined = routeProvider;
const scope = { setTransactionName: vi.fn() };

vi.mock('@sentry/browser', () => ({
  browserTracingIntegration: (options: { instrumentNavigation?: boolean }) => {
    upstreamOptions.push(options);
    return upstreamIntegration;
  },
  startBrowserTracingNavigationSpan: (...args: unknown[]) => startBrowserTracingNavigationSpan(...args),
  getActiveSpan: () => activeSpan,
  getCurrentScope: () => scope,
  getRootSpan: (span: unknown) => span,
  getRouteProvider: () => registeredProvider,
  resolveRoute: (url: string) => registeredProvider?.resolveRoute(new URL(url, 'https://app.test')),
  resolveCurrentRoute: () => registeredProvider?.resolveCurrentRoute(),
  WINDOW: globalThis,
}));

vi.mock('@sentry/core', async importOriginal => ({
  ...(await importOriginal<typeof SentryCore>()),
  spanToJSON: (span: FakeSpan) => ({ attributes: { 'sentry.op': span.op } }),
  addFetchInstrumentationHandler: (handler: typeof fetchHandler) => {
    fetchHandler = handler;
  },
}));

const { browserTracingIntegration } = await import('../../src/v3/client/browserTracingIntegration');

/** A response to the runtime's frame fetch, as the fetch instrumentation reports it. */
function frameResponse(url: string, serverTiming?: string, servedUrl = url) {
  return {
    fetchData: { url },
    headers: new Headers({ 'x-remix-frame': 'true' }),
    endTimestamp: 1,
    response: {
      url: new URL(servedUrl, 'https://app.test').href,
      headers: new Headers(serverTiming ? { 'server-timing': serverTiming } : {}),
    },
  };
}

/** A frame fetch that failed: settled, but with no response. */
function failedFrameFetch(url: string) {
  return { fetchData: { url }, headers: new Headers({ 'x-remix-frame': 'true' }), endTimestamp: 1 };
}

interface FakeNavigateEvent {
  canIntercept: boolean;
  info?: unknown;
  destination?: { url: string };
}

let spanEnd: ((span: unknown) => void) | undefined;
const client = {
  getOptions: () => ({ traceLifecycle: 'stream' }),
  on: (hook: string, callback: (span: unknown) => void) => {
    if (hook === 'spanEnd') {
      spanEnd = callback;
    }
  },
} as unknown as Client;

/** Sets up the integration over a fake Navigation API and returns a way to fire `navigate` events. */
function setup(options = {}, pathname = '/'): (event: FakeNavigateEvent) => void {
  let listener: ((event: FakeNavigateEvent) => void) | undefined;

  Object.assign(globalThis, {
    location: { origin: 'https://app.test', pathname, href: `https://app.test${pathname}` },
    navigation: {
      addEventListener: (_type: string, fn: (event: FakeNavigateEvent) => void) => {
        listener = fn;
      },
    },
  });

  browserTracingIntegration(options).afterAllSetup?.(client);

  return event => listener?.(event);
}

describe('browserTracingIntegration', () => {
  beforeEach(() => {
    startBrowserTracingNavigationSpan.mockClear();
    upstreamOptions.length = 0;
    navigationSpan = fakeSpan('navigation');
    activeSpan = undefined;
    fetchHandler = undefined;
    recorded.clear();
    registeredProvider = routeProvider;
    scope.setTransactionName.mockClear();
    Object.assign(globalThis, { performance: { getEntriesByType: () => [] } });
  });

  it('records the route the document reports, so the whole SDK can resolve it', () => {
    activeSpan = fakeSpan('pageload');
    Object.assign(globalThis, {
      performance: {
        getEntriesByType: () => [{ serverTiming: [{ name: 'sentry-route', description: '/users/:id' }] }],
      },
    });

    setup({}, '/users/1');

    expect(recorded.get('/users/1')).toBe('/users/:id');
  });

  it('names a navigation span from the provider right away when the route is already known', () => {
    recorded.set('/users/12345', '/users/:id');
    const navigate = setup();

    navigate({ canIntercept: true, destination: { url: 'https://app.test/users/12345' } });

    expect(startBrowserTracingNavigationSpan).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        name: '/users/:id',
        attributes: expect.objectContaining({ 'sentry.segment.name.source': 'route', 'url.template': '/users/:id' }),
      }),
      { url: 'https://app.test/users/12345' },
    );
  });

  it('still names spans from the response without a provider that records', () => {
    registeredProvider = undefined;
    const navigate = setup();
    navigate({ canIntercept: true, destination: { url: 'https://app.test/users/12345' } });

    fetchHandler?.(frameResponse('/users/12345', 'sentry-route;desc="/users/:id"'));

    expect(navigationSpan?.updateName).not.toHaveBeenCalled();
  });

  it("names the page load span after the route the document's Server-Timing reports", () => {
    activeSpan = fakeSpan('pageload');
    Object.assign(globalThis, {
      performance: {
        getEntriesByType: () => [{ serverTiming: [{ name: 'sentry-route', description: '/users/:id' }] }],
      },
    });

    setup();

    expect(activeSpan.updateName).toHaveBeenCalledWith('/users/:id');
    expect(activeSpan.setAttributes).toHaveBeenCalledWith({
      'sentry.segment.name.source': 'route',
      'url.template': '/users/:id',
    });
    expect(scope.setTransactionName).toHaveBeenCalledWith('/users/:id');
  });

  it('leaves the page load span alone when the document reports no route', () => {
    activeSpan = fakeSpan('pageload');

    setup();

    expect(activeSpan.updateName).not.toHaveBeenCalled();
  });

  it('does not rename an active span that is not a page load', () => {
    activeSpan = fakeSpan('navigation');
    Object.assign(globalThis, {
      performance: { getEntriesByType: () => [{ serverTiming: [{ name: 'sentry-route', description: '/' }] }] },
    });

    setup();

    expect(activeSpan.updateName).not.toHaveBeenCalled();
  });

  it("names the navigation span after the route in the destination's response", () => {
    const navigate = setup();
    navigate({ canIntercept: true, destination: { url: 'https://app.test/users/12345' } });
    activeSpan = navigationSpan;

    fetchHandler?.(frameResponse('/users/12345', 'db;dur=3, sentry-route;desc="/users/:id"'));

    expect(navigationSpan?.updateName).toHaveBeenCalledWith('/users/:id');
    expect(navigationSpan?.setAttributes).toHaveBeenCalledWith({
      'sentry.segment.name.source': 'route',
      'url.template': '/users/:id',
    });
    // Errors captured from now on group by the route, not the path the span started under.
    expect(scope.setTransactionName).toHaveBeenCalledWith('/users/:id');
  });

  it('drops the response for a navigation whose span already ended', () => {
    const first = fakeSpan('navigation');
    const second = fakeSpan('navigation');
    const navigate = setup();
    navigationSpan = first;
    navigate({ canIntercept: true, destination: { url: 'https://app.test/users/1' } });
    navigationSpan = second;
    navigate({ canIntercept: true, destination: { url: 'https://app.test/items/2' } });
    activeSpan = second;
    // Starting the second navigation ended the first span.
    spanEnd?.(first);

    fetchHandler?.(frameResponse('/items/2', 'sentry-route;desc="/items/:id"'));
    fetchHandler?.(frameResponse('/users/1', 'sentry-route;desc="/users/:id"'));

    expect(second.updateName).toHaveBeenCalledWith('/items/:id');
    expect(first.updateName).not.toHaveBeenCalled();
    expect(scope.setTransactionName).toHaveBeenCalledTimes(1);
    expect(scope.setTransactionName).toHaveBeenCalledWith('/items/:id');
  });

  it('unquotes the route the header carries', () => {
    const navigate = setup();
    navigate({ canIntercept: true, destination: { url: 'https://app.test/files/x' } });

    fetchHandler?.(frameResponse('/files/x', 'sentry-route;desc="/files/:name(\\"a\\\\b\\")"'));

    expect(navigationSpan?.updateName).toHaveBeenCalledWith('/files/:name("a\\b")');
  });

  it('records a redirected response under the path that served it, not the one requested', () => {
    const navigate = setup();
    navigate({ canIntercept: true, destination: { url: 'https://app.test/old/5' } });
    activeSpan = navigationSpan;

    fetchHandler?.(frameResponse('/old/5', 'sentry-route;desc="/users/:id"', '/users/5'));

    expect(recorded.get('/users/5')).toBe('/users/:id');
    expect(recorded.has('/old/5')).toBe(false);
    expect(navigationSpan?.updateName).toHaveBeenCalledWith('/users/:id');
  });

  it('still names a repeated navigation after the aborted first attempt reports its failure', () => {
    const first = fakeSpan('navigation');
    const second = fakeSpan('navigation');
    const navigate = setup();
    navigationSpan = first;
    navigate({ canIntercept: true, destination: { url: 'https://app.test/users/1' } });
    navigationSpan = second;
    navigate({ canIntercept: true, destination: { url: 'https://app.test/users/1' } });
    activeSpan = second;

    // The Navigation API aborted the first intercept; its rejection arrives after the second queued.
    fetchHandler?.(failedFrameFetch('/users/1'));
    fetchHandler?.(frameResponse('/users/1', 'sentry-route;desc="/users/:id"'));

    expect(second.updateName).toHaveBeenCalledWith('/users/:id');
    expect(first.updateName).not.toHaveBeenCalled();
  });

  it('forgets the pending span when it ends', () => {
    const navigate = setup();
    navigate({ canIntercept: true, destination: { url: 'https://app.test/users/1' } });
    spanEnd?.(navigationSpan);

    fetchHandler?.(frameResponse('/users/1', 'sentry-route;desc="/users/:id"'));

    expect(navigationSpan?.updateName).not.toHaveBeenCalled();
  });

  it("ignores the app's own fetches during a navigation", () => {
    const navigate = setup();
    navigate({ canIntercept: true, destination: { url: 'https://app.test/users/12345' } });

    // Same path as the navigation, but without the runtime's frame header: the app's own fetch.
    fetchHandler?.({ ...frameResponse('/users/12345', 'sentry-route;desc="/users/:id"'), headers: new Headers() });
    expect(navigationSpan?.updateName).not.toHaveBeenCalled();

    // The navigation is still waiting for its own response.
    fetchHandler?.(frameResponse('/users/12345', 'sentry-route;desc="/users/:id"'));
    expect(navigationSpan?.updateName).toHaveBeenCalledWith('/users/:id');
  });

  it('renames a navigation span once, from its own response only', () => {
    const navigate = setup();
    navigate({ canIntercept: true, destination: { url: 'https://app.test/users/12345' } });
    fetchHandler?.(frameResponse('/users/12345'));

    fetchHandler?.(frameResponse('/users/12345', 'sentry-route;desc="/users/:id"'));

    expect(navigationSpan?.updateName).not.toHaveBeenCalled();
  });

  it('leaves page loads to the upstream integration and takes over navigation', () => {
    setup();

    expect(upstreamOptions[0]).toEqual({ instrumentNavigation: false });
  });

  it('starts a navigation span for an intercepted navigation', () => {
    const navigate = setup();

    navigate({ canIntercept: true, destination: { url: 'https://app.test/users/12345' } });

    expect(startBrowserTracingNavigationSpan).toHaveBeenCalledWith(
      client,
      {
        // Low cardinality until the server reports the route.
        name: 'Navigation',
        attributes: {
          'sentry.segment.name.source': 'url',
          'sentry.origin': 'auto.navigation.remix_v3',
        },
      },
      { url: 'https://app.test/users/12345' },
    );
  });

  // Each of these becomes a new document load, which the upstream integration reports as a page load,
  // so a navigation span would count the same action twice.
  it.each([
    ['the runtime cannot intercept it', { canIntercept: false, destination: { url: 'https://app.test/x' } }],
    [
      "it is the runtime's own document reload",
      { canIntercept: true, info: 'remix-document-reload', destination: { url: 'https://app.test/x' } },
    ],
    ['it leaves the origin', { canIntercept: true, destination: { url: 'https://elsewhere.test/x' } }],
    ['there is no destination', { canIntercept: true }],
  ])('starts no navigation span when %s', (_why, event) => {
    const navigate = setup();

    navigate(event as FakeNavigateEvent);

    expect(startBrowserTracingNavigationSpan).not.toHaveBeenCalled();
  });

  it('names the span after the path when span streaming is off', () => {
    const staticClient = { getOptions: () => ({ traceLifecycle: 'static' }), on: () => {} } as unknown as Client;
    let listener: ((event: FakeNavigateEvent) => void) | undefined;
    Object.assign(globalThis, {
      location: { origin: 'https://app.test', pathname: '/' },
      navigation: { addEventListener: (_t: string, fn: typeof listener) => void (listener = fn) },
    });
    browserTracingIntegration().afterAllSetup?.(staticClient);

    listener?.({ canIntercept: true, destination: { url: 'https://app.test/users/12345?q=1' } });

    expect(startBrowserTracingNavigationSpan).toHaveBeenCalledWith(
      staticClient,
      expect.objectContaining({ name: '/users/12345' }),
      { url: 'https://app.test/users/12345?q=1' },
    );
  });

  it('starts no navigation span when instrumentNavigation is off', () => {
    const navigate = setup({ instrumentNavigation: false });

    navigate({ canIntercept: true, destination: { url: 'https://app.test/users/1' } });

    expect(startBrowserTracingNavigationSpan).not.toHaveBeenCalled();
  });
});
