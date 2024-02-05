import { WINDOW } from '@sentry/react';
import type { StartSpanOptions, Transaction, TransactionContext } from '@sentry/types';

import { appRouterInstrumentation } from './appRouterRoutingInstrumentation';
import { pagesRouterInstrumentation } from './pagesRouterRoutingInstrumentation';

type StartTransactionCb = (context: TransactionContext) => Transaction | undefined;
type StartSpanCb = (context: StartSpanOptions) => void;

/**
 * Instruments the Next.js Client Router.
 *
 * @deprecated Use `browserTracingIntegration()` as exported from `@sentry/nextjs` instead.
 */
export function nextRouterInstrumentation(
  startTransactionCb: StartTransactionCb,
  startTransactionOnPageLoad: boolean = true,
  startTransactionOnLocationChange: boolean = true,
  startPageloadSpanCallback?: StartSpanCb,
  startNavigationSpanCallback?: StartSpanCb,
): void {
  const isAppRouter = !WINDOW.document.getElementById('__NEXT_DATA__');
  if (isAppRouter) {
    appRouterInstrumentation(
      startTransactionCb,
      startTransactionOnPageLoad,
      startTransactionOnLocationChange,
      startPageloadSpanCallback || (() => undefined),
      startNavigationSpanCallback || (() => undefined),
    );
  } else {
    pagesRouterInstrumentation(
      startTransactionCb,
      startTransactionOnPageLoad,
      startTransactionOnLocationChange,
      startPageloadSpanCallback || (() => undefined),
      startNavigationSpanCallback || (() => undefined),
    );
  }
}
