import { captureException } from '@sentry/browser';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  getActiveSpan,
  getCurrentScope,
  getRootSpan,
  spanToJSON,
} from '@sentry/core';
import type { Span, SpanAttributes, StartSpanOptions, TransactionSource } from '@sentry/types';

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
 * Instrument the Vue router to create navigation spans.
 */
export function instrumentVueRouter(
  router: VueRouter,
  options: {
    /**
     * What to use for route labels.
     * By default, we use route.name (if set) and else the path.
     *
     * Default: 'name'
     */
    routeLabel: 'name' | 'path';
    instrumentPageLoad: boolean;
    instrumentNavigation: boolean;
  },
  startNavigationSpanFn: (context: StartSpanOptions) => void,
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
    let spanName: string = to.path;
    let transactionSource: TransactionSource = 'url';
    if (to.name && options.routeLabel !== 'path') {
      spanName = to.name.toString();
      transactionSource = 'custom';
    } else if (to.matched[0] && to.matched[0].path) {
      spanName = to.matched[0].path;
      transactionSource = 'route';
    }

    getCurrentScope().setTransactionName(spanName);

    if (options.instrumentPageLoad && isPageLoadNavigation) {
      const activeRootSpan = getActiveRootSpan();
      if (activeRootSpan) {
        const existingAttributes = spanToJSON(activeRootSpan).data || {};
        if (existingAttributes[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE] !== 'custom') {
          activeRootSpan.updateName(spanName);
          activeRootSpan.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, transactionSource);
        }
        // Set router attributes on the existing pageload transaction
        // This will override the origin, and add params & query attributes
        activeRootSpan.setAttributes({
          ...attributes,
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.pageload.vue',
        });
      }
    }

    if (options.instrumentNavigation && !isPageLoadNavigation) {
      attributes[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE] = transactionSource;
      attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN] = 'auto.navigation.vue';
      startNavigationSpanFn({
        name: spanName,
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

function getActiveRootSpan(): Span | undefined {
  const span = getActiveSpan();
  const rootSpan = span && getRootSpan(span);

  if (!rootSpan) {
    return undefined;
  }

  const op = spanToJSON(rootSpan).op;

  // Only use this root span if it is a pageload or navigation span
  return op === 'navigation' || op === 'pageload' ? rootSpan : undefined;
}
