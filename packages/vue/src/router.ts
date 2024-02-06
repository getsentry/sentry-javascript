import { WINDOW, captureException } from '@sentry/browser';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  getActiveSpan,
  getRootSpan,
  spanToJSON,
} from '@sentry/core';
import type { SpanAttributes, Transaction, TransactionContext, TransactionSource } from '@sentry/types';

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
 *
 * @deprecated Use `browserTracingIntegration()` from `@sentry/vue` instead - this includes the vue router instrumentation.
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
    // We have to start the pageload transaction as early as possible (before the router's `beforeEach` hook
    // is called) to not miss child spans of the pageload.
    // We check that window & window.location exists in order to not run this code in SSR environments.
    if (startTransactionOnPageLoad && WINDOW && WINDOW.location) {
      startTransaction({
        name: WINDOW.location.pathname,
        op: 'pageload',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.pageload.vue',
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
        },
      });
    }

    instrumentVueRouter(
      router,
      {
        routeLabel: options.routeLabel || 'name',
        instrumentNavigation: startTransactionOnLocationChange,
        instrumentPageLoad: startTransactionOnPageLoad,
      },
      startTransaction,
    );
  };
}

/**
 * Instrument the Vue router to create navigation spans.
 */
export function instrumentVueRouter(
  router: VueRouter,
  options: {
    routeLabel: 'name' | 'path';
    instrumentPageLoad: boolean;
    instrumentNavigation: boolean;
  },
  startNavigationSpanFn: (context: TransactionContext) => void,
): void {
  router.onError(error => captureException(error, { mechanism: { handled: false } }));

  router.beforeEach((to, from, next) => {
    // According to docs we could use `from === VueRouter.START_LOCATION` but I couldnt get it working for Vue 2
    // https://router.vuejs.org/api/#router-start-location
    // https://next.router.vuejs.org/api/#start-location

    // from.name:
    // - Vue 2: null
    // - Vue 3: undefined
    // hence only '==' instead of '===', because `undefined == null` evaluates to `true`
    const isPageLoadNavigation = from.name == null && from.matched.length === 0;

    const attributes: SpanAttributes = {
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.vue',
    };

    for (const key of Object.keys(to.params)) {
      attributes[`params.${key}`] = to.params[key];
    }
    for (const key of Object.keys(to.query)) {
      const value = to.query[key];
      if (value) {
        attributes[`query.${key}`] = value;
      }
    }

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

    if (options.instrumentPageLoad && isPageLoadNavigation) {
      const activeSpan = getActiveSpan();
      const rootSpan = activeSpan && getRootSpan(activeSpan);
      if (rootSpan) {
        const existingAttributes = spanToJSON(rootSpan).data || {};
        if (existingAttributes[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE] !== 'custom') {
          rootSpan.updateName(transactionName);
          rootSpan.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, transactionSource);
        }
        // Set router attributes on the existing pageload transaction
        // This will override the origin, and add params & query attributes
        rootSpan.setAttributes({
          ...attributes,
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.pageload.vue',
        });
      }
    }

    if (options.instrumentNavigation && !isPageLoadNavigation) {
      attributes[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE] = transactionSource;
      attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN] = 'auto.navigation.vue';
      startNavigationSpanFn({
        name: transactionName,
        op: 'navigation',
        attributes,
      });
    }

    // Vue Router 4 no longer exposes the `next` function, so we need to
    // check if it's available before calling it.
    // `next` needs to be called in Vue Router 3 so that the hook is resolved.
    if (next) {
      next();
    }
  });
}
