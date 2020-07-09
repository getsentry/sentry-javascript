import { Transaction as TransactionType, TransactionContext } from '@sentry/types';
import { addInstrumentationHandler, getGlobalObject, logger } from '@sentry/utils';

// type StartTransaction
const global = getGlobalObject<Window>();

/**
 * Creates a default router based on
 */
export function defaultRoutingInstrumentation<T extends TransactionType>(
  startTransaction: (context: TransactionContext) => T | undefined,
  startTransactionOnPageLoad: boolean = true,
  startTransactionOnLocationChange: boolean = true,
): void {
  if (!global || !global.location) {
    logger.warn('Could not initialize routing instrumentation due to invalid location');
    return;
  }

  let startingUrl: string | undefined = global.location.href;

  let activeTransaction: T | undefined;
  if (startTransactionOnPageLoad) {
    activeTransaction = startTransaction({ name: global.location.pathname, op: 'pageload' });
  }

  if (startTransactionOnLocationChange) {
    addInstrumentationHandler({
      callback: ({ to, from }: { to: string; from?: string }) => {
        /**
         * This early return is there to account for some cases where navigation transaction
         * starts right after long running pageload. We make sure that if `from` is undefined
         * and that a valid `startingURL` exists, we don't uncessarily create a navigation transaction.
         *
         * This was hard to duplicate, but this behaviour stopped as soon as this fix
         * was applied. This issue might also only be caused in certain development environments
         * where the usage of a hot module reloader is causing errors.
         */
        if (from === undefined && startingUrl && startingUrl.indexOf(to) !== -1) {
          startingUrl = undefined;
          return;
        }
        if (from !== to) {
          startingUrl = undefined;
          if (activeTransaction) {
            logger.log(`[Tracing] finishing current idleTransaction with op: ${activeTransaction.op}`);
            // We want to finish all current ongoing idle transactions as we
            // are navigating to a new page.
            activeTransaction.finish();
          }
          activeTransaction = startTransaction({ name: global.location.pathname, op: 'navigation' });
        }
      },
      type: 'history',
    });
  }
}

/** default implementation of Browser Tracing before navigate */
export function defaultBeforeNavigate(context: TransactionContext): TransactionContext | undefined {
  return context;
}
