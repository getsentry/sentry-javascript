import { Transaction, TransactionContext } from '@sentry/types';

import { wrapRouter } from './nextRouterWrapper';

export function nextRouterInstrumentation(
  startTransaction: (context: TransactionContext) => Transaction | undefined,
  startTransactionOnPageLoad: boolean = true,
  startTransactionOnLocationChange: boolean = true,
): void {
  wrapRouter(startTransaction, startTransactionOnLocationChange);
  if (startTransactionOnPageLoad) {
    startTransaction({
      name: window.location.pathname,
      op: 'pageload',
    });
  }
}

// TODO: check for the info we can get from the router events,
// note that it may interfere with the wrapping
// https://nextjs.org/docs/api-reference/next/router#routerevents
