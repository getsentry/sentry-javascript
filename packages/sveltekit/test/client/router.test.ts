/* eslint-disable @typescript-eslint/unbound-method */
import type { Transaction } from '@sentry/types';
import { writable } from 'svelte/store';
import type { SpyInstance } from 'vitest';
import { vi } from 'vitest';

import { navigating, page } from '$app/stores';

import { svelteKitRoutingInstrumentation } from '../../src/client/router';

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

describe('sveltekitRoutingInstrumentation', () => {
  let returnedTransaction: (Transaction & { returnedTransaction: SpyInstance }) | undefined;
  const mockedStartTransaction = vi.fn().mockImplementation(txnCtx => {
    returnedTransaction = {
      ...txnCtx,
      setName: vi.fn(),
      startChild: vi.fn().mockImplementation(ctx => {
        return { ...mockedRoutingSpan, ...ctx };
      }),
      setTag: vi.fn(),
    };
    return returnedTransaction;
  });

  const mockedRoutingSpan = {
    finish: () => {},
  };

  const routingSpanFinishSpy = vi.spyOn(mockedRoutingSpan, 'finish');

  beforeEach(() => {
    navigatingStore = writable();
    vi.clearAllMocks();
  });

  it("starts a pageload transaction when it's called with default params", () => {
    svelteKitRoutingInstrumentation(mockedStartTransaction);

    expect(mockedStartTransaction).toHaveBeenCalledTimes(1);
    expect(mockedStartTransaction).toHaveBeenCalledWith({
      name: '/',
      op: 'pageload',
      origin: 'auto.http.sveltekit',
      description: '/',
      tags: {
        'routing.instrumentation': '@sentry/sveltekit',
      },
      metadata: {
        source: 'url',
      },
    });

    // We emit an update to the `page` store to simulate the SvelteKit router lifecycle
    // @ts-ignore This is fine because we testUtils/stores.ts defines `page` as a writable store
    page.set({ route: { id: 'testRoute' } });

    // This should update the transaction name with the parameterized route:
    expect(returnedTransaction?.setName).toHaveBeenCalledTimes(1);
    expect(returnedTransaction?.setName).toHaveBeenCalledWith('testRoute', 'route');
  });

  it("doesn't start a pageload transaction if `startTransactionOnPageLoad` is false", () => {
    svelteKitRoutingInstrumentation(mockedStartTransaction, false);
    expect(mockedStartTransaction).toHaveBeenCalledTimes(0);
  });

  it("doesn't start a navigation transaction when `startTransactionOnLocationChange` is false", () => {
    svelteKitRoutingInstrumentation(mockedStartTransaction, false, false);

    // We emit an update to the `navigating` store to simulate the SvelteKit navigation lifecycle
    // @ts-ignore This is fine because we testUtils/stores.ts defines `navigating` as a writable store
    navigating.set({
      from: { route: { id: '/users' }, url: { pathname: '/users' } },
      to: { route: { id: '/users/[id]' }, url: { pathname: '/users/7762' } },
    });

    // This should update the transaction name with the parameterized route:
    expect(mockedStartTransaction).toHaveBeenCalledTimes(0);
  });

  it('starts a navigation transaction when `startTransactionOnLocationChange` is true', () => {
    svelteKitRoutingInstrumentation(mockedStartTransaction, false, true);

    // We emit an update to the `navigating` store to simulate the SvelteKit navigation lifecycle
    // @ts-ignore This is fine because we testUtils/stores.ts defines `navigating` as a writable store
    navigating.set({
      from: { route: { id: '/users' }, url: { pathname: '/users' } },
      to: { route: { id: '/users/[id]' }, url: { pathname: '/users/7762' } },
    });

    // This should update the transaction name with the parameterized route:
    expect(mockedStartTransaction).toHaveBeenCalledTimes(1);
    expect(mockedStartTransaction).toHaveBeenCalledWith({
      name: '/users/[id]',
      op: 'navigation',
      origin: 'auto.http.sveltekit',
      metadata: {
        source: 'route',
      },
      tags: {
        'routing.instrumentation': '@sentry/sveltekit',
      },
    });

    expect(returnedTransaction?.startChild).toHaveBeenCalledWith({
      op: 'ui.sveltekit.routing',
      origin: 'auto.ui.sveltekit',
      description: 'SvelteKit Route Change',
    });

    expect(returnedTransaction?.setTag).toHaveBeenCalledWith('from', '/users');

    // We emit `null` here to simulate the end of the navigation lifecycle
    // @ts-ignore this is fine
    navigating.set(null);

    expect(routingSpanFinishSpy).toHaveBeenCalledTimes(1);
  });

  describe('handling same origin and destination navigations', () => {
    it("doesn't start a navigation transaction if the raw navigation origin and destination are equal", () => {
      svelteKitRoutingInstrumentation(mockedStartTransaction, false, true);

      // We emit an update to the `navigating` store to simulate the SvelteKit navigation lifecycle
      // @ts-ignore This is fine because we testUtils/stores.ts defines `navigating` as a writable store
      navigating.set({
        from: { route: { id: '/users/[id]' }, url: { pathname: '/users/7762' } },
        to: { route: { id: '/users/[id]' }, url: { pathname: '/users/7762' } },
      });

      expect(mockedStartTransaction).toHaveBeenCalledTimes(0);
    });

    it('starts a navigation transaction if the raw navigation origin and destination are not equal', () => {
      svelteKitRoutingInstrumentation(mockedStartTransaction, false, true);

      // @ts-ignore This is fine
      navigating.set({
        from: { route: { id: '/users/[id]' }, url: { pathname: '/users/7762' } },
        to: { route: { id: '/users/[id]' }, url: { pathname: '/users/223412' } },
      });

      expect(mockedStartTransaction).toHaveBeenCalledTimes(1);
      expect(mockedStartTransaction).toHaveBeenCalledWith({
        name: '/users/[id]',
        op: 'navigation',
        origin: 'auto.http.sveltekit',
        metadata: {
          source: 'route',
        },
        tags: {
          'routing.instrumentation': '@sentry/sveltekit',
        },
      });

      expect(returnedTransaction?.startChild).toHaveBeenCalledWith({
        op: 'ui.sveltekit.routing',
        origin: 'auto.ui.sveltekit',
        description: 'SvelteKit Route Change',
      });

      expect(returnedTransaction?.setTag).toHaveBeenCalledWith('from', '/users/[id]');
    });

    it('falls back to `window.location.pathname` to determine the raw origin', () => {
      svelteKitRoutingInstrumentation(mockedStartTransaction, false, true);

      // window.location.pathame is "/" in tests

      // @ts-ignore This is fine
      navigating.set({
        to: { route: {}, url: { pathname: '/' } },
      });

      expect(mockedStartTransaction).toHaveBeenCalledTimes(0);
    });
  });
});
