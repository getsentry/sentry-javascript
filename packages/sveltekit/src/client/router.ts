import { getCurrentHub, WINDOW } from '@sentry/svelte';
import type { Span, Transaction, TransactionContext } from '@sentry/types';

import { navigating, page } from '$app/stores';

/**
 *
 * @param startTransactionFn
 * @param startTransactionOnPageLoad
 * @param startTransactionOnLocationChange
 * @returns
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
  const pageloadTransaction = createPageloadTxn(startTransactionFn);

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

    activeTransaction = getActiveTransaction();

    if (!activeTransaction) {
      activeTransaction = startTransactionFn({
        name: routeDestination || 'unknown',
        op: 'navigation',
        metadata: { source: 'route' },
      });
    }

    if (activeTransaction) {
      if (routingSpan) {
        // If a routing span is still open from a previous navigation, we finish it.
        routingSpan.finish();
      }
      routingSpan = activeTransaction.startChild({
        description: 'SvelteKit Route Change',
        op: 'ui.sveltekit.routing',
        tags: {
          'routing.instrumentation': '@sentry/sveltekit',
          from: routeOrigin,
          to: routeDestination,
        },
      });
    }
  });
}

function createPageloadTxn(
  startTransactionFn: (context: TransactionContext) => Transaction | undefined,
): Transaction | undefined {
  const ctx: TransactionContext = {
    name: 'pageload',
    op: 'pageload',
    description: WINDOW.location.pathname,
  };

  return startTransactionFn(ctx);
}

function getActiveTransaction(): Transaction | undefined {
  const scope = getCurrentHub().getScope();
  return scope && scope.getTransaction();
}
