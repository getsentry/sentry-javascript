/**
 * @vitest-environment jsdom
 */

/* eslint-disable @typescript-eslint/unbound-method */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Span } from '@sentry/types';
import { writable } from 'svelte/store';

import { navigating, page } from '$app/stores';

import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, SEMANTIC_ATTRIBUTE_SENTRY_SOURCE } from '@sentry/core';
import { browserTracingIntegration } from '../../src/client';

import * as SentrySvelte from '@sentry/svelte';

// we have to overwrite the global mock from `vitest.setup.ts` here to reset the
// `navigating` store for each test.
vi.mock('$app/stores', async () => {
  return {
    get navigating() {
      return navigatingStore;
    },
    page: writable(),
  };
});

let navigatingStore = writable();

describe('browserTracingIntegration', () => {
  const svelteBrowserTracingIntegrationSpy = vi.spyOn(SentrySvelte, 'browserTracingIntegration');

  let createdRootSpan: Partial<Span> | undefined;

  // @ts-expect-error - only returning a partial span here, that's fine
  vi.spyOn(SentrySvelte, 'getActiveSpan').mockImplementation(() => {
    return createdRootSpan;
  });

  const startBrowserTracingPageLoadSpanSpy = vi
    .spyOn(SentrySvelte, 'startBrowserTracingPageLoadSpan')
    .mockImplementation((_client, txnCtx) => {
      createdRootSpan = {
        ...txnCtx,
        updateName: vi.fn(),
        setAttribute: vi.fn(),
      };
      return createdRootSpan as Span;
    });

  const startBrowserTracingNavigationSpanSpy = vi
    .spyOn(SentrySvelte, 'startBrowserTracingNavigationSpan')
    .mockImplementation((_client, txnCtx) => {
      createdRootSpan = {
        ...txnCtx,
        updateName: vi.fn(),
        setAttribute: vi.fn(),
      };
      return createdRootSpan as Span;
    });

  const fakeClient = { getOptions: () => ({}), on: () => {}, addEventProcessor: () => {} };

  const mockedRoutingSpan = {
    end: () => {},
  };

  const routingSpanEndSpy = vi.spyOn(mockedRoutingSpan, 'end');

  // @ts-expect-error - mockedRoutingSpan is not a complete Span, that's fine
  const startInactiveSpanSpy = vi.spyOn(SentrySvelte, 'startInactiveSpan').mockImplementation(() => mockedRoutingSpan);

  beforeEach(() => {
    createdRootSpan = undefined;
    navigatingStore = writable();
    vi.clearAllMocks();
  });

  it('implements required hooks', () => {
    const integration = browserTracingIntegration();
    expect(integration.name).toEqual('BrowserTracing');
    expect(integration.afterAllSetup).toBeDefined();
  });

  it('passes on the options to the original integration', () => {
    browserTracingIntegration({ enableLongTask: true, idleTimeout: 4242 });
    expect(svelteBrowserTracingIntegrationSpy).toHaveBeenCalledTimes(1);
    expect(svelteBrowserTracingIntegrationSpy).toHaveBeenCalledWith({
      enableLongTask: true,
      idleTimeout: 4242,
      instrumentNavigation: false,
      instrumentPageLoad: false,
    });
  });

  it('always disables `instrumentNavigation` and `instrumentPageLoad` in the original integration', () => {
    browserTracingIntegration({ instrumentNavigation: true, instrumentPageLoad: true });
    expect(svelteBrowserTracingIntegrationSpy).toHaveBeenCalledTimes(1);
    // This is fine and expected because we don't want to start the default instrumentation
    // SvelteKit's browserTracingIntegration takes care of instrumenting pageloads and navigations on its own.
    expect(svelteBrowserTracingIntegrationSpy).toHaveBeenCalledWith({
      instrumentNavigation: false,
      instrumentPageLoad: false,
    });
  });

  it("starts a pageload span when it's called with default params", () => {
    const integration = browserTracingIntegration();
    // @ts-expect-error - the fakeClient doesn't satisfy Client but that's fine
    integration.afterAllSetup(fakeClient);

    expect(startBrowserTracingPageLoadSpanSpy).toHaveBeenCalledTimes(1);
    expect(startBrowserTracingPageLoadSpanSpy).toHaveBeenCalledWith(fakeClient, {
      name: '/',
      op: 'pageload',
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.pageload.sveltekit',
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
      },
    });

    // We emit an update to the `page` store to simulate the SvelteKit router lifecycle
    // @ts-expect-error - page is a writable but the types say it's just readable
    page.set({ route: { id: 'testRoute' } });

    // This should update the transaction name with the parameterized route:
    expect(createdRootSpan?.updateName).toHaveBeenCalledTimes(1);
    expect(createdRootSpan?.updateName).toHaveBeenCalledWith('testRoute');
    expect(createdRootSpan?.setAttribute).toHaveBeenCalledWith(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'route');
  });

  it("doesn't start a pageload span if `instrumentPageLoad` is false", () => {
    const integration = browserTracingIntegration({
      instrumentPageLoad: false,
    });
    // @ts-expect-error - the fakeClient doesn't satisfy Client but that's fine
    integration.afterAllSetup(fakeClient);

    expect(startBrowserTracingPageLoadSpanSpy).toHaveBeenCalledTimes(0);
  });

  it("updates the current scope's transactionName once it's resolved during pageload", () => {
    const scopeSetTransactionNameSpy = vi.fn();

    // @ts-expect-error - only returning a partial scope here, that's fine
    vi.spyOn(SentrySvelte, 'getCurrentScope').mockImplementation(() => {
      return {
        setTransactionName: scopeSetTransactionNameSpy,
      };
    });

    const integration = browserTracingIntegration();
    // @ts-expect-error - the fakeClient doesn't satisfy Client but that's fine
    integration.afterAllSetup(fakeClient);

    // We emit an update to the `page` store to simulate the SvelteKit router lifecycle
    // @ts-expect-error - page is a writable but the types say it's just readable
    page.set({ route: { id: 'testRoute/:id' } });

    // This should update the transaction name with the parameterized route:
    expect(scopeSetTransactionNameSpy).toHaveBeenCalledTimes(3);
    expect(scopeSetTransactionNameSpy).toHaveBeenLastCalledWith('testRoute/:id');
  });

  it("doesn't start a navigation span when `instrumentNavigation` is false", () => {
    const integration = browserTracingIntegration({
      instrumentNavigation: false,
    });
    // @ts-expect-error - the fakeClient doesn't satisfy Client but that's fine
    integration.afterAllSetup(fakeClient);

    // We emit an update to the `navigating` store to simulate the SvelteKit navigation lifecycle
    // @ts-expect-error - page is a writable but the types say it's just readable
    navigating.set({
      from: { route: { id: '/users' }, url: { pathname: '/users' } },
      to: { route: { id: '/users/[id]' }, url: { pathname: '/users/7762' } },
    });

    // This should update the transaction name with the parameterized route:
    expect(startBrowserTracingNavigationSpanSpy).toHaveBeenCalledTimes(0);
  });

  it('starts a navigation span when `startTransactionOnLocationChange` is true', () => {
    const integration = browserTracingIntegration({
      instrumentPageLoad: false,
    });
    // @ts-expect-error - the fakeClient doesn't satisfy Client but that's fine
    integration.afterAllSetup(fakeClient);

    // We emit an update to the `navigating` store to simulate the SvelteKit navigation lifecycle
    // @ts-expect-error - page is a writable but the types say it's just readable
    navigating.set({
      from: { route: { id: '/users' }, url: { pathname: '/users' } },
      to: { route: { id: '/users/[id]' }, url: { pathname: '/users/7762' } },
      type: 'link',
    });

    // This should update the transaction name with the parameterized route:
    expect(startBrowserTracingNavigationSpanSpy).toHaveBeenCalledTimes(1);
    expect(startBrowserTracingNavigationSpanSpy).toHaveBeenCalledWith(fakeClient, {
      name: '/users/[id]',
      op: 'navigation',
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.sveltekit',
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
        'sentry.sveltekit.navigation.from': '/users',
        'sentry.sveltekit.navigation.to': '/users/[id]',
        'sentry.sveltekit.navigation.type': 'link',
      },
    });

    expect(startInactiveSpanSpy).toHaveBeenCalledWith({
      op: 'ui.sveltekit.routing',
      name: 'SvelteKit Route Change',
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ui.sveltekit',
        'sentry.sveltekit.navigation.from': '/users',
        'sentry.sveltekit.navigation.to': '/users/[id]',
        'sentry.sveltekit.navigation.type': 'link',
      },
      onlyIfParent: true,
    });

    // We emit `null` here to simulate the end of the navigation lifecycle
    // @ts-expect-error - page is a writable but the types say it's just readable
    navigating.set(null);

    expect(routingSpanEndSpy).toHaveBeenCalledTimes(1);
  });

  describe('handling same origin and destination navigations', () => {
    it("doesn't start a navigation span if the raw navigation origin and destination are equal", () => {
      const integration = browserTracingIntegration({
        instrumentPageLoad: false,
      });
      // @ts-expect-error - the fakeClient doesn't satisfy Client but that's fine
      integration.afterAllSetup(fakeClient);

      // We emit an update to the `navigating` store to simulate the SvelteKit navigation lifecycle
      // @ts-expect-error - page is a writable but the types say it's just readable
      navigating.set({
        from: { route: { id: '/users/[id]' }, url: { pathname: '/users/7762' } },
        to: { route: { id: '/users/[id]' }, url: { pathname: '/users/7762' } },
      });

      expect(startBrowserTracingNavigationSpanSpy).toHaveBeenCalledTimes(0);
    });

    it('starts a navigation transaction if the raw navigation origin and destination are not equal', () => {
      const integration = browserTracingIntegration({
        instrumentPageLoad: false,
      });
      // @ts-expect-error - the fakeClient doesn't satisfy Client but that's fine
      integration.afterAllSetup(fakeClient);

      // @ts-expect-error - page is a writable but the types say it's just readable
      navigating.set({
        from: { route: { id: '/users/[id]' }, url: { pathname: '/users/7762' } },
        to: { route: { id: '/users/[id]' }, url: { pathname: '/users/223412' } },
      });

      expect(startBrowserTracingNavigationSpanSpy).toHaveBeenCalledTimes(1);
      expect(startBrowserTracingNavigationSpanSpy).toHaveBeenCalledWith(fakeClient, {
        name: '/users/[id]',
        op: 'navigation',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.sveltekit',
          'sentry.sveltekit.navigation.from': '/users/[id]',
          'sentry.sveltekit.navigation.to': '/users/[id]',
        },
      });

      expect(startInactiveSpanSpy).toHaveBeenCalledWith({
        op: 'ui.sveltekit.routing',
        name: 'SvelteKit Route Change',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ui.sveltekit',
          'sentry.sveltekit.navigation.from': '/users/[id]',
          'sentry.sveltekit.navigation.to': '/users/[id]',
        },
        onlyIfParent: true,
      });
    });

    it('falls back to `window.location.pathname` to determine the raw origin', () => {
      const integration = browserTracingIntegration({
        instrumentPageLoad: false,
      });
      // @ts-expect-error - the fakeClient doesn't satisfy Client but that's fine
      integration.afterAllSetup(fakeClient);

      // window.location.pathname is "/" in tests

      // @ts-expect-error - page is a writable but the types say it's just readable
      navigating.set({
        to: { route: {}, url: { pathname: '/' } },
      });

      expect(startBrowserTracingNavigationSpanSpy).toHaveBeenCalledTimes(0);
    });
  });
});
