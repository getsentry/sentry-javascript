/**
 * @vitest-environment jsdom
 */

/* eslint-disable @typescript-eslint/unbound-method */
import type { Span } from '@sentry/core';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, SEMANTIC_ATTRIBUTE_SENTRY_SOURCE } from '@sentry/core';
import * as SentrySvelte from '@sentry/svelte';
import { URL_TEMPLATE } from '@sentry/conventions/attributes';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { instrumentSvelteKitTracing } from '../../src/client/svelte5BrowserTracing';

// The Svelte 5 variant reads navigation state from rune-backed helpers (`navigationState.svelte.ts`),
// which need the Svelte compiler. We mock them here so the variant's orchestration logic (fetch
// wrapper, dedup, pageload upgrade) can be unit-tested; the rune integration itself is covered by the
// `sveltekit-3` e2e app.
let currentNavigation: unknown = null;
let navigationChangeCb: ((navigation: unknown) => void) | undefined;
let pageRouteChangeCb: ((routeId: string | null) => void) | undefined;

vi.mock('../../src/client/navigationState.svelte', () => ({
  getCurrentNavigation: () => currentNavigation,
  onNavigationChange: (cb: (navigation: unknown) => void) => {
    navigationChangeCb = cb;
    return () => {};
  },
  onPageRouteChange: (cb: (routeId: string | null) => void) => {
    pageRouteChangeCb = cb;
    return () => {};
  },
}));

const navigationTo = (fromId: string, toId: string, toPath: string, href: string): unknown => ({
  from: { route: { id: fromId }, url: { pathname: `/${fromId}` } },
  to: { route: { id: toId }, url: { pathname: toPath, href } },
  type: 'link',
});

describe('svelte5 browser tracing', () => {
  let createdRootSpan: Partial<Span> | undefined;

  const startPageLoadSpanSpy = vi
    .spyOn(SentrySvelte, 'startBrowserTracingPageLoadSpan')
    .mockImplementation((_client, ctx) => {
      createdRootSpan = { ...ctx, updateName: vi.fn(), setAttributes: vi.fn() };
      return createdRootSpan as Span;
    });

  const startNavigationSpanSpy = vi
    .spyOn(SentrySvelte, 'startBrowserTracingNavigationSpan')
    .mockImplementation((_client, ctx) => {
      createdRootSpan = { ...ctx, updateName: vi.fn(), setAttributes: vi.fn() };
      return createdRootSpan as Span;
    });

  const routingSpan = { end: vi.fn() };
  const startInactiveSpanSpy = vi
    .spyOn(SentrySvelte, 'startInactiveSpan')
    .mockImplementation(() => routingSpan as unknown as Span);

  const setTransactionNameSpy = vi.fn();
  vi.spyOn(SentrySvelte, 'getCurrentScope').mockImplementation(
    () => ({ setTransactionName: setTransactionNameSpy }) as unknown as ReturnType<typeof SentrySvelte.getCurrentScope>,
  );

  const client = { getOptions: () => ({}) } as Parameters<typeof instrumentSvelteKitTracing>[0];

  beforeEach(() => {
    vi.clearAllMocks();
    currentNavigation = null;
    navigationChangeCb = undefined;
    pageRouteChangeCb = undefined;
    createdRootSpan = undefined;
    // The variant wraps `window.fetch`; give it a resolvable fetch to wrap and reset each test.
    window.fetch = vi.fn().mockResolvedValue(undefined);
  });

  describe('pageload', () => {
    it('starts a `url`-sourced pageload span and upgrades to `route` once the route id resolves', () => {
      instrumentSvelteKitTracing(client, {});

      expect(startPageLoadSpanSpy).toHaveBeenCalledWith(client, {
        name: '/',
        op: 'pageload',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.pageload.sveltekit',
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
        },
      });

      pageRouteChangeCb?.('/users/[id]');

      expect(createdRootSpan?.updateName).toHaveBeenCalledWith('/users/[id]');
      expect(createdRootSpan?.setAttributes).toHaveBeenCalledWith({
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
        [URL_TEMPLATE]: '/users/[id]',
      });
      expect(setTransactionNameSpy).toHaveBeenCalledWith('/users/[id]');
    });

    it("doesn't upgrade the pageload span while the route id is still null", () => {
      instrumentSvelteKitTracing(client, {});
      pageRouteChangeCb?.(null);
      expect(createdRootSpan?.updateName).not.toHaveBeenCalled();
    });

    it('respects `instrumentPageLoad: false`', () => {
      instrumentSvelteKitTracing(client, { instrumentPageLoad: false });
      expect(startPageLoadSpanSpy).not.toHaveBeenCalled();
    });
  });

  describe('navigation', () => {
    it('starts the navigation span from the outgoing fetch (before the request), sourced by route', async () => {
      instrumentSvelteKitTracing(client, {});
      currentNavigation = navigationTo('/', '/users/[id]', '/users/7', 'https://sentry-test.io/users/7');

      await window.fetch('https://sentry-test.io/users/7/__data.json');

      expect(startNavigationSpanSpy).toHaveBeenCalledTimes(1);
      expect(startNavigationSpanSpy).toHaveBeenCalledWith(
        client,
        expect.objectContaining({
          name: '/users/[id]',
          op: 'navigation',
          attributes: expect.objectContaining({
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.sveltekit',
            [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
            [URL_TEMPLATE]: '/users/[id]',
          }),
        }),
        { url: 'https://sentry-test.io/users/7' },
      );
    });

    it('deduplicates: several fetches within one navigation start exactly one span', async () => {
      instrumentSvelteKitTracing(client, {});
      currentNavigation = navigationTo('/', '/a', '/a', 'https://sentry-test.io/a');

      await window.fetch('https://sentry-test.io/a/__data.json');
      await window.fetch('https://sentry-test.io/a/sub-request');

      expect(startNavigationSpanSpy).toHaveBeenCalledTimes(1);
    });

    it('falls back to the `onNavigationChange` effect for navigations without a fetch, and ends the routing span on completion', () => {
      instrumentSvelteKitTracing(client, {});

      navigationChangeCb?.(navigationTo('/', '/a', '/a', 'https://sentry-test.io/a'));
      expect(startNavigationSpanSpy).toHaveBeenCalledTimes(1);
      expect(startInactiveSpanSpy).toHaveBeenCalledTimes(1);

      // `navigating` emits null when navigation completes
      navigationChangeCb?.(null);
      expect(routingSpan.end).toHaveBeenCalledTimes(1);
    });

    it("doesn't start a navigation span when origin and destination raw paths are equal", async () => {
      instrumentSvelteKitTracing(client, {});
      currentNavigation = navigationTo('/a', '/a', '/a', 'https://sentry-test.io/a');
      // origin pathname is derived from `from.url.pathname` -> '//a'; make them equal explicitly
      (currentNavigation as { from: { url: { pathname: string } } }).from.url.pathname = '/a';

      await window.fetch('https://sentry-test.io/a');

      expect(startNavigationSpanSpy).not.toHaveBeenCalled();
    });

    it('respects `instrumentNavigation: false` (no fetch wrapper span)', async () => {
      instrumentSvelteKitTracing(client, { instrumentNavigation: false });
      currentNavigation = navigationTo('/', '/a', '/a', 'https://sentry-test.io/a');

      await window.fetch('https://sentry-test.io/a');

      expect(startNavigationSpanSpy).not.toHaveBeenCalled();
    });
  });
});
