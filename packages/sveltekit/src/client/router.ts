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
    description: initialPath,
    tags: {
      ...DEFAULT_TAGS,
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

    const routeDestination = navigation.to && navigation.to.route.id;
    const routeOrigin = navigation.from && navigation.from.route.id;

    if (routeOrigin === routeDestination) {
      return;
    }

    activeTransaction = getActiveTransaction();

    if (!activeTransaction) {
      activeTransaction = startTransactionFn({
        name: routeDestination || (WINDOW && WINDOW.location && WINDOW.location.pathname),
        op: 'navigation',
        metadata: { source: 'route' },
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
      });
      activeTransaction.setTag('from', routeOrigin);
    }
  });
}
