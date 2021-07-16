import { captureException } from '@sentry/browser';
import { Transaction, TransactionContext } from '@sentry/types';

export type VueRouterInstrumentation = <T extends Transaction>(
  startTransaction: (context: TransactionContext) => T | undefined,
  startTransactionOnPageLoad?: boolean,
  startTransactionOnLocationChange?: boolean,
) => void;

// This is not great, but kinda necessary to make it work with VueRouter@3 and VueRouter@4 at the same time.
type Route = {
  params: any;
  query: any;
  name: any;
  path: any;
  matched: any[];
};
interface VueRouter {
  onError: (fn: (err: Error) => void) => void;
  beforeEach: (fn: (to: Route, from: Route, next: () => void) => void) => void;
}

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

    router.beforeEach((to, from, next) => {
      // According to docs we could use `from === VueRouter.START_LOCATION` but I couldnt get it working for Vue 2
      // https://router.vuejs.org/api/#router-start-location
      // https://next.router.vuejs.org/api/#start-location

      // Vue2 - null
      // Vue3 - undefined
      const isPageLoadNavigation = from.name == null && from.matched.length === 0;

      const tags = {
        'routing.instrumentation': 'vue-router',
      };
      const data = {
        params: to.params,
        query: to.query,
      };

      if (startTransactionOnPageLoad && isPageLoadNavigation) {
        startTransaction({
          name: to.name || to.path,
          op: 'pageload',
          tags,
          data,
        });
      }

      if (startTransactionOnLocationChange && !isPageLoadNavigation) {
        startTransaction({
          name: to.name || to.matched[0].path || to.path,
          op: 'navigation',
          tags,
          data,
        });
      }

      next();
    });
  };
}
