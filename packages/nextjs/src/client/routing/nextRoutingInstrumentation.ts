import { WINDOW } from '@sentry/react';
import type { Transaction, TransactionContext } from '@sentry/types';

import { appRouterInstrumentation } from './appRouterRoutingInstrumentation';
import { pagesRouterInstrumentation } from './pagesRouterRoutingInstrumentation';

type StartTransactionCb = (context: TransactionContext) => Transaction | undefined;

/**
 * Instruments the Next.js Clientside Router.
 */
export function nextRouterInstrumentation(
  startTransactionCb: StartTransactionCb,
  startTransactionOnPageLoad: boolean = true,
  startTransactionOnLocationChange: boolean = true,
): void {
  const isAppRouter = !WINDOW.document.getElementById('__NEXT_DATA__');
  if (isAppRouter) {
    appRouterInstrumentation(startTransactionCb, startTransactionOnPageLoad, startTransactionOnLocationChange);
  } else {
    pagesRouterInstrumentation(startTransactionCb, startTransactionOnPageLoad, startTransactionOnLocationChange);
  }
}
