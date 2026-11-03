// @vitest-environment jsdom
import { SENTRY_LINK_TYPE, SENTRY_OP, URL_FULL, URL_PATH } from '@sentry/conventions/attributes';
import { PAGELOAD } from '@sentry/conventions/op';
import type { Client } from '@sentry/core';
import type * as SentryCore from '@sentry/core';
import type * as SentryReact from '@sentry/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// Loaded for their side effect: `setup()` re-imports these for every test, and the first of
// those imports also pays for transforming the whole `@sentry/react` graph. Charged to a test
// that ran into the 5s timeout on a loaded CI runner; charged to collection it is untimed.
// Later imports only re-evaluate an already transformed graph, which is cheap.
import '@sentry/core';
import '@sentry/react';
import '../../src/client/routing/appRouterRoutingInstrumentation';
import '../../src/client/routing/appRouterPageloadInstrumentation';
import type * as AppRouterInstrumentation from '../../src/client/routing/appRouterRoutingInstrumentation';
import type * as AppRouterPageload from '../../src/client/routing/appRouterPageloadInstrumentation';
import type * as RouteProvider from '../../src/client/routing/routeProvider';
import type { RouteManifest } from '../../src/config/manifest/types';

type Core = typeof SentryCore;
type React = typeof SentryReact;
type Instrumentation = typeof AppRouterInstrumentation;
type PageloadInstrumentation = typeof AppRouterPageload;
type RouteProviderModule = typeof RouteProvider;

interface NextRouter {
  back: () => void;
  forward: () => void;
  push: (target: string) => void;
  replace: (target: string) => void;
}

const globalWithNext = globalThis as typeof globalThis & {
  next?: { router?: NextRouter };
  _sentryRouteManifest?: string;
  _sentryBasePath?: string;
};

const manifest: RouteManifest = {
  staticRoutes: [{ path: '/navigation' }],
  dynamicRoutes: [
    {
      path: '/navigation/:param/router-back',
      regex: '^/navigation/([^/]+)/router-back$',
      paramNames: ['param'],
      hasOptionalPrefix: false,
    },
    {
      path: '/my-app/navigation/:param/router-push',
      regex: '^/my-app/navigation/([^/]+)/router-push$',
      paramNames: ['param'],
      hasOptionalPrefix: false,
    },
  ],
};

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * The instrumentation module keeps its routing state (patched routers, the current navigation span,
 * the popstate listener) at module level, so every test gets fresh copies of it and of the SDK
 * packages it imports. The `popstate` listeners of earlier tests stay registered on `window`, but
 * they only reach clients that are no longer current, whose navigation handlers bail out early.
 */
async function setup(traceLifecycle: 'stream' | 'static'): Promise<{
  core: Core;
  router: NextRouter;
  client: Client;
  instrumentation: Instrumentation;
  pageload: PageloadInstrumentation;
}> {
  vi.resetModules();
  const core: Core = await import('@sentry/core');
  // The scopes live on a global carrier that `vi.resetModules()` keeps, so the active span of an
  // earlier test would otherwise become the parent of the spans of this one.
  core.getMainCarrier().__SENTRY__ = undefined;
  const react: React = await import('@sentry/react');
  const instrumentation: Instrumentation = await import('../../src/client/routing/appRouterRoutingInstrumentation');
  const pageload: PageloadInstrumentation = await import('../../src/client/routing/appRouterPageloadInstrumentation');
  const routeProvider: RouteProviderModule = await import('../../src/client/routing/routeProvider');

  const client = new react.BrowserClient({
    dsn: 'http://examplePublicKey@localhost/0',
    transport: () => core.createTransport({ recordDroppedEvent: () => undefined }, () => core.resolvedSyncPromise({})),
    stackParser: () => [],
    tracesSampleRate: 1,
    traceLifecycle,
    routeProvider: routeProvider.createNextRouteProvider(),
    integrations: [react.browserTracingIntegration({ instrumentPageLoad: false, instrumentNavigation: false })],
  });
  core.setCurrentClient(client);
  client.init();

  const router: NextRouter = { back: vi.fn(), forward: vi.fn(), push: vi.fn(), replace: vi.fn() };
  const originalBack = router.back;
  globalWithNext.next = { router };

  instrumentation.appRouterInstrumentNavigation(client);
  await vi.waitFor(() => expect(router.back).not.toBe(originalBack));

  return { core, router, client, instrumentation, pageload };
}

describe('appRouterInstrumentNavigation (router-patch mode)', () => {
  beforeEach(() => {
    globalWithNext._sentryRouteManifest = JSON.stringify(manifest);
    window.history.replaceState({}, '', '/navigation');
  });

  afterEach(() => {
    vi.useRealTimers();
    delete globalWithNext.next;
    delete globalWithNext._sentryRouteManifest;
  });

  describe.each(['stream', 'static'] as const)('with traceLifecycle %s', traceLifecycle => {
    it('tags the navigation span of `router.back()` with `router.back` and starts it at the call', async () => {
      const { core, router } = await setup(traceLifecycle);

      const beforeCall = core.timestampInSeconds();
      router.back();
      const afterCall = core.timestampInSeconds();

      await sleep(30);
      window.history.replaceState({}, '', '/navigation/1337/router-back?foo=bar');
      window.dispatchEvent(new PopStateEvent('popstate'));

      const span = core.getActiveSpan();
      expect(span).toBeDefined();
      const spanJson = core.spanToJSON(span!);
      expect(spanJson.name).toBe('/navigation/:param/router-back');
      expect(spanJson.attributes).toEqual(
        expect.objectContaining({
          'sentry.op': 'navigation',
          'navigation.type': 'router.back',
          'url.template': '/navigation/:param/router-back',
          'url.path': '/navigation/1337/router-back',
          'url.full': 'http://localhost:3000/navigation/1337/router-back?foo=bar',
        }),
      );
      expect(spanJson.start_timestamp).toBeGreaterThanOrEqual(beforeCall);
      expect(spanJson.start_timestamp).toBeLessThanOrEqual(afterCall);
    });

    it('tags the navigation span of `router.forward()` with `router.forward`', async () => {
      const { core, router } = await setup(traceLifecycle);

      router.forward();
      window.history.replaceState({}, '', '/navigation/1337/router-back');
      window.dispatchEvent(new PopStateEvent('popstate'));

      const span = core.getActiveSpan();
      expect(span).toBeDefined();
      expect(core.spanToJSON(span!).attributes).toEqual(
        expect.objectContaining({ 'navigation.type': 'router.forward' }),
      );
    });

    it('keeps the router call when the main thread is blocked until the popstate', async () => {
      const { core, router } = await setup(traceLifecycle);

      router.back();
      const blockedUntil = Date.now() + 1100;
      while (Date.now() < blockedUntil) {
        // busy-wait
      }
      window.history.replaceState({}, '', '/navigation/1337/router-back');
      window.dispatchEvent(new PopStateEvent('popstate'));

      const span = core.getActiveSpan();
      expect(span).toBeDefined();
      expect(core.spanToJSON(span!).attributes).toEqual(expect.objectContaining({ 'navigation.type': 'router.back' }));
    });

    it('starts a new span for `router.back()` while a `router.push()` span is still open', async () => {
      const { core, router } = await setup(traceLifecycle);

      router.push('/navigation');
      const pushSpan = core.getActiveSpan();
      expect(pushSpan).toBeDefined();

      router.back();
      window.history.replaceState({}, '', '/navigation/1337/router-back');
      window.dispatchEvent(new PopStateEvent('popstate'));

      const span = core.getActiveSpan();
      expect(span).toBeDefined();
      expect(span).not.toBe(pushSpan);
      expect(core.spanToJSON(span!).attributes).toEqual(expect.objectContaining({ 'navigation.type': 'router.back' }));
      expect(core.spanToJSON(pushSpan!).attributes).toEqual(
        expect.objectContaining({ 'navigation.type': 'router.push' }),
      );
      expect(core.spanToJSON(pushSpan!).end_timestamp).toBeDefined();
    });

    it('tags a popstate without a preceding router call with `browser.popstate`', async () => {
      const { core } = await setup(traceLifecycle);

      window.history.replaceState({}, '', '/navigation/1337/router-back');
      window.dispatchEvent(new PopStateEvent('popstate'));

      const span = core.getActiveSpan();
      expect(span).toBeDefined();
      const spanJson = core.spanToJSON(span!);
      expect(spanJson.name).toBe('/navigation/:param/router-back');
      expect(spanJson.attributes).toEqual(expect.objectContaining({ 'navigation.type': 'browser.popstate' }));
    });

    it('does not carry a router call over to a later, unrelated popstate', async () => {
      const { core, router } = await setup(traceLifecycle);

      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      router.forward();
      // A `forward()` without a forward history entry never fires `popstate`.
      vi.advanceTimersByTime(1000);

      window.history.replaceState({}, '', '/navigation/1337/router-back');
      window.dispatchEvent(new PopStateEvent('popstate'));

      const span = core.getActiveSpan();
      expect(span).toBeDefined();
      expect(core.spanToJSON(span!).attributes).toEqual(
        expect.objectContaining({ 'navigation.type': 'browser.popstate' }),
      );
    });
  });
});

describe('appRouterInstrumentNavigation with basePath', () => {
  beforeEach(() => {
    globalWithNext._sentryRouteManifest = JSON.stringify(manifest);
    globalWithNext._sentryBasePath = '/my-app';
    window.history.replaceState({}, '', '/my-app/navigation');
  });

  afterEach(() => {
    delete globalWithNext.next;
    delete globalWithNext._sentryRouteManifest;
    delete globalWithNext._sentryBasePath;
  });

  it.each([
    ['a root-relative path without basePath', '/navigation/42/router-push'],
    ['a root-relative path with basePath', '/my-app/navigation/42/router-push'],
    ['an absolute URL', 'http://localhost:3000/my-app/navigation/42/router-push'],
  ])('names the router-patch navigation span correctly for %s', async (_, href) => {
    const { core, router } = await setup('static');

    router.push(href);

    const span = core.getActiveSpan();
    expect(span).toBeDefined();
    const spanJson = core.spanToJSON(span!);
    expect(spanJson.name).toBe('/my-app/navigation/:param/router-push');
    expect(spanJson.attributes).toEqual(
      expect.objectContaining({ 'url.full': 'http://localhost:3000/my-app/navigation/42/router-push' }),
    );
  });

  it.each([
    ['a root-relative path without basePath', '/navigation/42/router-push'],
    ['a root-relative path with basePath', '/my-app/navigation/42/router-push'],
    ['an absolute URL', 'http://localhost:3000/my-app/navigation/42/router-push'],
  ])('names the transition-start-hook navigation span correctly for %s', async (_, href) => {
    const { core, instrumentation } = await setup('static');

    instrumentation.captureRouterTransitionStart(href, 'push');

    const span = core.getActiveSpan();
    expect(span).toBeDefined();
    expect(core.spanToJSON(span!).name).toBe('/my-app/navigation/:param/router-push');
  });
});

describe('appRouterInstrumentPageLoad', () => {
  const originalReadyState = Object.getOwnPropertyDescriptor(Document.prototype, 'readyState');
  const PRERENDER_TRACE_ID = '11111111111111111111111111111111';
  const PRERENDER_SENTRY_TRACE = `${PRERENDER_TRACE_ID}-1111111111111111-1`;
  const PRERENDER_LINK = {
    trace_id: PRERENDER_TRACE_ID,
    span_id: '1111111111111111',
    sampled: true,
    attributes: { [SENTRY_LINK_TYPE]: 'cache_origin' },
  };

  function setReadyState(value: DocumentReadyState): void {
    Object.defineProperty(document, 'readyState', { value, configurable: true });
  }

  function appendMeta(parent: HTMLElement, name: string, content: string): void {
    const meta = document.createElement('meta');
    meta.setAttribute('name', name);
    meta.setAttribute('content', content);
    parent.appendChild(meta);
  }

  beforeEach(() => {
    globalWithNext._sentryRouteManifest = JSON.stringify(manifest);
    window.history.replaceState({}, '', '/navigation?from=document');
    setReadyState('loading');
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([]);
    vi.stubEnv('_sentryCacheComponents', 'true');
  });

  afterEach(() => {
    delete globalWithNext.next;
    delete globalWithNext._sentryRouteManifest;
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    vi.useRealTimers();
    // @ts-expect-error deleting the instance override restores the prototype getter
    delete document.readyState;
    if (originalReadyState) {
      Object.defineProperty(Document.prototype, 'readyState', originalReadyState);
    }
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('records the URL of the document when the pageload starts after a navigation changed it', async () => {
    const { core, pageload } = await setup('static');

    pageload.appRouterInstrumentPageLoad(core.getClient()!);
    const spanBeforeSettling = core.getActiveSpan();

    window.history.replaceState({}, '', '/navigation/42/router-back');
    pageload.settlePendingPageloadWait();

    const span = core.getActiveSpan();
    expect(span).toBeDefined();
    expect(span).not.toBe(spanBeforeSettling);
    const spanJson = core.spanToJSON(span!);
    expect(spanJson.name).toBe('/navigation');
    expect(spanJson.attributes?.[SENTRY_OP]).toBe(PAGELOAD);
    expect(spanJson.attributes).toEqual(
      expect.objectContaining({
        [URL_PATH]: '/navigation',
        [URL_FULL]: 'http://localhost:3000/navigation?from=document',
      }),
    );
    expect(core.getCurrentScope().getScopeData().sdkProcessingMetadata.normalizedRequest?.url).toBe(
      'http://localhost:3000/navigation?from=document',
    );
  });

  // `settlePendingPageloadWait` is a no-op when the pageload did not wait, so both cases run the same steps.
  it.each([
    { start: 'at once', cacheComponents: 'false' },
    { start: 'after the wait', cacheComponents: 'true' },
  ])(
    'filters sensitive query parameters from the document URL of a pageload that starts $start',
    async ({ cacheComponents }) => {
      vi.stubEnv('_sentryCacheComponents', cacheComponents);
      window.history.replaceState({}, '', '/navigation?token=2c4f9e1b&from=document');
      const { core, pageload } = await setup('static');

      pageload.appRouterInstrumentPageLoad(core.getClient()!);
      pageload.settlePendingPageloadWait();

      const filteredUrl = 'http://localhost:3000/navigation?token=[Filtered]&from=document';
      expect(core.spanToJSON(core.getActiveSpan()!).attributes?.[URL_FULL]).toBe(filteredUrl);
      expect(core.getCurrentScope().getScopeData().sdkProcessingMetadata.normalizedRequest?.url).toBe(filteredUrl);
    },
  );

  it('starts a new trace for a static page and links the prerender as cache origin', async () => {
    const { core, pageload } = await setup('static');
    setReadyState('complete');
    appendMeta(document.head, 'sentry-cache-origin', PRERENDER_SENTRY_TRACE);

    pageload.appRouterInstrumentPageLoad(core.getClient()!);

    const spanJson = core.spanToJSON(core.getActiveSpan()!);
    expect(spanJson.attributes?.[SENTRY_OP]).toBe(PAGELOAD);
    expect(spanJson.attributes?.['page.server_rendering.type']).toBe('static');
    expect(spanJson.trace_id).not.toBe(PRERENDER_TRACE_ID);
    expect(spanJson.links).toEqual([PRERENDER_LINK]);
  });

  // A shell that was prerendered at runtime keeps its tag, and the part resumed for this request
  // brings its own `sentry-trace` tag.
  it('continues the server trace of a resumed cached shell and links the prerender as cache origin', async () => {
    const { core, pageload } = await setup('static');
    setReadyState('complete');
    appendMeta(document.head, 'sentry-cache-origin', PRERENDER_SENTRY_TRACE);
    appendMeta(document.body, 'sentry-trace', '22222222222222222222222222222222-2222222222222222-1');

    pageload.appRouterInstrumentPageLoad(core.getClient()!);

    const spanJson = core.spanToJSON(core.getActiveSpan()!);
    expect(spanJson.trace_id).toBe('22222222222222222222222222222222');
    expect(spanJson.parent_span_id).toBe('2222222222222222');
    expect(spanJson.attributes?.['page.server_rendering.type']).toBe('partially_static');
    expect(spanJson.links).toEqual([PRERENDER_LINK]);
  });

  it('links the prerender without a type when a navigation starts the pageload before the resumed part', async () => {
    const { core, pageload } = await setup('static');
    appendMeta(document.head, 'sentry-cache-origin', PRERENDER_SENTRY_TRACE);

    pageload.appRouterInstrumentPageLoad(core.getClient()!);
    pageload.settlePendingPageloadWait();

    const spanJson = core.spanToJSON(core.getActiveSpan()!);
    expect(spanJson.attributes?.[SENTRY_OP]).toBe(PAGELOAD);
    expect(spanJson.attributes).not.toHaveProperty('page.server_rendering.type');
    expect(spanJson.links).toEqual([PRERENDER_LINK]);
  });

  it('links the server request when its trace meta tag arrives after the wait gave up', async () => {
    const { core, pageload } = await setup('static');
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    pageload.appRouterInstrumentPageLoad(core.getClient()!);
    vi.advanceTimersByTime(10_000);
    const span = core.getActiveSpan()!;
    appendMeta(document.body, 'sentry-trace', '22222222222222222222222222222222-2222222222222222-1');
    // MutationObserver callbacks run as microtasks.
    await Promise.resolve();

    const spanJson = core.spanToJSON(span);
    expect(spanJson.attributes?.[SENTRY_OP]).toBe(PAGELOAD);
    expect(spanJson.trace_id).not.toBe('22222222222222222222222222222222');
    expect(spanJson.links).toEqual([
      {
        trace_id: '22222222222222222222222222222222',
        span_id: '2222222222222222',
        sampled: true,
        attributes: { [SENTRY_LINK_TYPE]: 'server_request' },
      },
    ]);
  });
});
