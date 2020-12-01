import { captureException } from '@sentry/browser';
import { Transaction, TransactionContext } from '@sentry/types';
import VueRouter from 'vue-router';

export type Action = 'PUSH' | 'REPLACE' | 'POP';

export type VueRouterInstrumentation = <T extends Transaction>(
  startTransaction: (context: TransactionContext) => T | undefined,
  startTransactionOnPageLoad?: boolean,
  startTransactionOnLocationChange?: boolean,
) => void;

let firstLoad = true;

/**
 * Creates routing instrumentation for Vue Router v2
 *
 * @param router The Vue Router instance that is used
 */
export function vueRouterInstrumentation(router: VueRouter): VueRouterInstrumentation {
  return (
    startTransaction: (context: TransactionContext) => Transaction | undefined,
    startTransactionOnPageLoad: boolean = true,
    startTransactionOnLocationChange: boolean = true,
  ) => {
    router.onError(error => captureException(error));

    const tags = {
      'routing.instrumentation': 'vue-router',
    };

    router.beforeEach((to, _from, next) => {
      const data = {
        params: to.params,
        query: to.query,
      };

      if (startTransactionOnPageLoad && firstLoad) {
        startTransaction({
          name: to.name || to.path,
          op: 'pageload',
          tags,
          data,
        });
      }

      if (startTransactionOnLocationChange && !firstLoad) {
        startTransaction({
          name: to.name || to.matched[0].path || to.path,
          op: 'navigation',
          tags,
          data,
        });
      }

      firstLoad = false;
      next();
    });
  };
}
