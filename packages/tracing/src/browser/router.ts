import { Transaction, TransactionContext } from '@sentry/types';
import { addInstrumentationHandler, getGlobalObject, logger } from '@sentry/utils';

const global = getGlobalObject<Window>();

/**
 * Default function implementing pageload and navigation transactions
 */
export function instrumentRoutingWithDefaults<T extends Transaction>(
  customStartTransaction: (context: TransactionContext) => T | undefined,
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
    activeTransaction = customStartTransaction({ name: global.location.pathname, op: 'pageload' });
  }

  if (startTransactionOnLocationChange) {
    addInstrumentationHandler({
      callback: ({ to, from }: { to: string; from?: string }) => {
        /**
         * This early return is there to account for some cases where a navigation transaction starts right after
         * long-running pageload. We make sure that if `from` is undefined and a valid `startingURL` exists, we don't
         * create an uneccessary navigation transaction.
         *
         * This was hard to duplicate, but this behavior stopped as soon as this fix was applied. This issue might also
         * only be caused in certain development environments where the usage of a hot module reloader is causing
         * errors.
         */
        if (from === undefined && startingUrl && startingUrl.indexOf(to) !== -1) {
          startingUrl = undefined;
          return;
        }

        if (from !== to) {
          startingUrl = undefined;
          if (activeTransaction) {
            logger.log(`[Tracing] Finishing current transaction with op: ${activeTransaction.op}`);
            // If there's an open transaction on the scope, we need to finish it before creating an new one.
            activeTransaction.finish();
          }
          activeTransaction = customStartTransaction({ name: global.location.pathname, op: 'navigation' });
        }
      },
      type: 'history',
    });
  }
}
