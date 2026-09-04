// @vitest-environment jsdom
import type { Client } from '@sentry/core';
import type * as SentryCore from '@sentry/core';
import type * as SentryReact from '@sentry/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  ],
  isrRoutes: [],
};

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * The instrumentation module keeps its routing state (patched routers, the current navigation span,
 * the popstate listener) at module level, so every test gets fresh copies of it and of the SDK
 * packages it imports.
 */
async function setup(traceLifecycle: 'stream' | 'static'): Promise<{
  core: Core;
  router: NextRouter;
  client: Client;
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

  return { core, router, client };
}

describe('appRouterInstrumentNavigation (router-patch mode)', () => {
  beforeEach(() => {
    globalWithNext._sentryRouteManifest = JSON.stringify(manifest);
    window.history.replaceState({}, '', '/navigation');
  });

  afterEach(() => {
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
      window.history.replaceState({}, '', '/navigation/1337/router-back');
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

      router.forward();
      // A `forward()` without a forward history entry never fires `popstate`.
      await sleep(1100);

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
