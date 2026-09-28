// @vitest-environment jsdom
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
import type * as AppRouterInstrumentation from '../../src/client/routing/appRouterRoutingInstrumentation';
import type { RouteManifest } from '../../src/config/manifest/types';

type Core = typeof SentryCore;
type React = typeof SentryReact;
type Instrumentation = typeof AppRouterInstrumentation;

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
  isrRoutes: [],
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
}> {
  vi.resetModules();
  const core: Core = await import('@sentry/core');
  const react: React = await import('@sentry/react');
  const instrumentation: Instrumentation = await import('../../src/client/routing/appRouterRoutingInstrumentation');

  const client = new react.BrowserClient({
    dsn: 'http://examplePublicKey@localhost/0',
    transport: () => core.createTransport({ recordDroppedEvent: () => undefined }, () => core.resolvedSyncPromise({})),
    stackParser: () => [],
    tracesSampleRate: 1,
    traceLifecycle,
    integrations: [react.browserTracingIntegration({ instrumentPageLoad: false, instrumentNavigation: false })],
  });
  core.setCurrentClient(client);
  client.init();

  const router: NextRouter = { back: vi.fn(), forward: vi.fn(), push: vi.fn(), replace: vi.fn() };
  const originalBack = router.back;
  globalWithNext.next = { router };

  instrumentation.appRouterInstrumentNavigation(client);
  await vi.waitFor(() => expect(router.back).not.toBe(originalBack));

  return { core, router, client, instrumentation };
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
