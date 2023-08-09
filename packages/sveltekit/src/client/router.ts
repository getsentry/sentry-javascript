import { getActiveTransaction } from '@sentry/core';
import { WINDOW } from '@sentry/svelte';
import type { Span, Transaction, TransactionContext } from '@sentry/types';

import { navigating, page } from '$app/stores';

const DEFAULT_TAGS = {
  'routing.instrumentation': '@sentry/sveltekit',
};

/**
 * Automatically creates pageload and navigation transactions for the client-side SvelteKit router.
 *
 * This instrumentation makes use of SvelteKit's `page` and `navigating` stores which can be accessed
 * anywhere on the client side.
 *
 * @param startTransactionFn the function used to start (idle) transactions
 * @param startTransactionOnPageLoad controls if pageload transactions should be created (defaults to `true`)
 * @param startTransactionOnLocationChange controls if navigation transactions should be created (defauls to `true`)
 */
export function svelteKitRoutingInstrumentation<T extends Transaction>(
  startTransactionFn: (context: TransactionContext) => T | undefined,
  startTransactionOnPageLoad: boolean = true,
  startTransactionOnLocationChange: boolean = true,
): void {
  if (startTransactionOnPageLoad) {
    instrumentPageload(startTransactionFn);
  }

  if (startTransactionOnLocationChange) {
    instrumentNavigations(startTransactionFn);
  }
}

function instrumentPageload(startTransactionFn: (context: TransactionContext) => Transaction | undefined): void {
  const initialPath = WINDOW && WINDOW.location && WINDOW.location.pathname;

  const pageloadTransaction = startTransactionFn({
    name: initialPath,
    op: 'pageload',
    origin: 'auto.http.sveltekit',
    description: initialPath,
    tags: {
      ...DEFAULT_TAGS,
    },
    metadata: {
      source: 'url',
    },
  });

  page.subscribe(page => {
    if (!page) {
      return;
    }

    const routeId = page.route && page.route.id;

    if (pageloadTransaction && routeId) {
      pageloadTransaction.setName(routeId, 'route');
    }
  });
}

/**
 * Use the `navigating` store to start a transaction on navigations.
 */
function instrumentNavigations(startTransactionFn: (context: TransactionContext) => Transaction | undefined): void {
  let routingSpan: Span | undefined = undefined;
  let activeTransaction: Transaction | undefined;

  navigating.subscribe(navigation => {
    if (!navigation) {
      // `navigating` emits a 'null' value when the navigation is completed.
      // So in this case, we can finish the routing span. If the transaction was an IdleTransaction,
      // it will finish automatically and if it was user-created users also need to finish it.
      if (routingSpan) {
        routingSpan.finish();
        routingSpan = undefined;
      }
      return;
    }

    const from = navigation.from;
    const to = navigation.to;

    // for the origin we can fall back to window.location.pathname because in this emission, it still is set to the origin path
    const rawRouteOrigin = (from && from.url.pathname) || (WINDOW && WINDOW.location && WINDOW.location.pathname);

    const rawRouteDestination = to && to.url.pathname;

    // We don't want to create transactions for navigations of same origin and destination.
    // We need to look at the raw URL here because parameterized routes can still differ in their raw parameters.
    if (rawRouteOrigin === rawRouteDestination) {
      return;
    }

    const parameterizedRouteOrigin = from && from.route.id;
    const parameterizedRouteDestination = to && to.route.id;

    activeTransaction = getActiveTransaction();

    if (!activeTransaction) {
      activeTransaction = startTransactionFn({
        name: parameterizedRouteDestination || rawRouteDestination || 'unknown',
        op: 'navigation',
        origin: 'auto.http.sveltekit',
        metadata: { source: parameterizedRouteDestination ? 'route' : 'url' },
        tags: {
          ...DEFAULT_TAGS,
        },
      });
    }

    if (activeTransaction) {
      if (routingSpan) {
        // If a routing span is still open from a previous navigation, we finish it.
        routingSpan.finish();
      }
      routingSpan = activeTransaction.startChild({
        op: 'ui.sveltekit.routing',
        description: 'SvelteKit Route Change',
        origin: 'auto.ui.sveltekit',
      });
      activeTransaction.setTag('from', parameterizedRouteOrigin);
    }
  });
}
