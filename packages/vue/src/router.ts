import { captureException, WINDOW } from '@sentry/browser';
import type { Transaction, TransactionContext, TransactionSource } from '@sentry/types';

import { getActiveTransaction } from './tracing';

interface VueRouterInstrumationOptions {
  /**
   * What to use for route labels.
   * By default, we use route.name (if set) and else the path.
   *
   * Default: 'name'
   */
  routeLabel: 'name' | 'path';
}

export type VueRouterInstrumentation = <T extends Transaction>(
  startTransaction: (context: TransactionContext) => T | undefined,
  startTransactionOnPageLoad?: boolean,
  startTransactionOnLocationChange?: boolean,
) => void;

// The following type is an intersection of the Route type from VueRouter v2, v3, and v4.
// This is not great, but kinda necessary to make it work with all versions at the same time.
export type Route = {
  /** Unparameterized URL */
  path: string;
  /**
   * Query params (keys map to null when there is no value associated, e.g. "?foo" and to an array when there are
   * multiple query params that have the same key, e.g. "?foo&foo=bar")
   */
  query: Record<string, string | null | (string | null)[]>;
  /** Route name (VueRouter provides a way to give routes individual names) */
  name?: string | symbol | null | undefined;
  /** Evaluated parameters */
  params: Record<string, string | string[]>;
  /** All the matched route objects as defined in VueRouter constructor */
  matched: { path: string }[];
};

interface VueRouter {
  onError: (fn: (err: Error) => void) => void;
  beforeEach: (fn: (to: Route, from: Route, next?: () => void) => void) => void;
}

/**
 * Creates routing instrumentation for Vue Router v2, v3 and v4
 *
 * You can optionally pass in an options object with the available option:
 * * `routeLabel`: Set this to `route` to opt-out of using `route.name` for transaction names.
 *
 * @param router The Vue Router instance that is used
 */
export function vueRouterInstrumentation(
  router: VueRouter,
  options: Partial<VueRouterInstrumationOptions> = {},
): VueRouterInstrumentation {
  return (
    startTransaction: (context: TransactionContext) => Transaction | undefined,
    startTransactionOnPageLoad: boolean = true,
    startTransactionOnLocationChange: boolean = true,
  ) => {
    const tags = {
      'routing.instrumentation': 'vue-router',
    };

    // We have to start the pageload transaction as early as possible (before the router's `beforeEach` hook
    // is called) to not miss child spans of the pageload.
    // We check that window & window.location exists in order to not run this code in SSR environments.
    if (startTransactionOnPageLoad && WINDOW && WINDOW.location) {
      startTransaction({
        name: WINDOW.location.pathname,
        op: 'pageload',
        origin: 'auto.http.vue',
        tags,
        metadata: {
          source: 'url',
        },
      });
    }

    router.onError(error => captureException(error));

    router.beforeEach((to, from, next) => {
      // According to docs we could use `from === VueRouter.START_LOCATION` but I couldnt get it working for Vue 2
      // https://router.vuejs.org/api/#router-start-location
      // https://next.router.vuejs.org/api/#start-location

      // from.name:
      // - Vue 2: null
      // - Vue 3: undefined
      // hence only '==' instead of '===', because `undefined == null` evaluates to `true`
      const isPageLoadNavigation = from.name == null && from.matched.length === 0;

      const data = {
        params: to.params,
        query: to.query,
      };

      // Determine a name for the routing transaction and where that name came from
      let transactionName: string = to.path;
      let transactionSource: TransactionSource = 'url';
      if (to.name && options.routeLabel !== 'path') {
        transactionName = to.name.toString();
        transactionSource = 'custom';
      } else if (to.matched[0] && to.matched[0].path) {
        transactionName = to.matched[0].path;
        transactionSource = 'route';
      }

      if (startTransactionOnPageLoad && isPageLoadNavigation) {
        const pageloadTransaction = getActiveTransaction();
        if (pageloadTransaction) {
          if (pageloadTransaction.metadata.source !== 'custom') {
            pageloadTransaction.setName(transactionName, transactionSource);
          }
          pageloadTransaction.setData('params', data.params);
          pageloadTransaction.setData('query', data.query);
        }
      }

      if (startTransactionOnLocationChange && !isPageLoadNavigation) {
        startTransaction({
          name: transactionName,
          op: 'navigation',
          origin: 'auto.http.vue',
          tags,
          data,
          metadata: {
            source: transactionSource,
          },
        });
      }

      // Vue Router 4 no longer exposes the `next` function, so we need to
      // check if it's available before calling it.
      // `next` needs to be called in Vue Router 3 so that the hook is resolved.
      if (next) {
        next();
      }
    });
  };
}
