import { captureException } from '@sentry/browser';
import type { Span, SpanAttributes, StartSpanOptions, TransactionSource } from '@sentry/core';
import {
  getActiveSpan,
  getCurrentScope,
  getRootSpan,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  spanToJSON,
} from '@sentry/core';

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
  // Vue Router 3 exposes a `mode` property ('hash' | 'history' | 'abstract').
  // Vue Router 4+ replaced it with `options.history`. Used for version detection.
  mode?: string;
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
  let hasHandledFirstPageLoad = false;

  // Detect Vue Router 3 by checking for the `mode` property which only exists in VR3.
  // Vue Router 4+ uses `options.history` instead and does not expose `mode`.
  const isLegacyRouter = 'mode' in router;

  router.onError(error => captureException(error, { mechanism: { handled: false } }));

  // Use rest params to capture `next` without declaring it as a named parameter.
  // This keeps Function.length === 2, which tells Vue Router 4+/5+ to use the
  // modern return-based resolution (no deprecation warning in Vue Router 5.0.3+).
  router.beforeEach((to: Route, _from: Route, ...rest: [(() => void)?]) => {
    // We avoid trying to re-fetch the page load span when we know we already handled it the first time
    const activePageLoadSpan = !hasHandledFirstPageLoad ? getActivePageLoadSpan() : undefined;

    const attributes: SpanAttributes = {};

    for (const key of Object.keys(to.params)) {
      attributes[`url.path.parameter.${key}`] = to.params[key];
      attributes[`params.${key}`] = to.params[key]; // params.[key] is an alias
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
    } else if (to.matched.length > 0) {
      const lastIndex = to.matched.length - 1;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      spanName = to.matched[lastIndex]!.path;
      transactionSource = 'route';
    }

    getCurrentScope().setTransactionName(spanName);

    // Update the existing page load span with parametrized route information
    if (options.instrumentPageLoad && activePageLoadSpan) {
      const existingAttributes = spanToJSON(activePageLoadSpan).data;
      if (existingAttributes[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE] !== 'custom') {
        activePageLoadSpan.updateName(spanName);
        activePageLoadSpan.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, transactionSource);
      }

      // Set router attributes on the existing pageload transaction
      // This will override the origin, and add params & query attributes
      activePageLoadSpan.setAttributes({
        ...attributes,
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.pageload.vue',
      });

      hasHandledFirstPageLoad = true;
    }

    if (options.instrumentNavigation && !activePageLoadSpan) {
      startNavigationSpanFn({
        name: spanName,
        op: 'navigation',
        attributes: {
          ...attributes,
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.vue',
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: transactionSource,
        },
      });
    }

    // Vue Router 3 requires `next()` to be called to resolve the navigation guard.
    // Vue Router 4+ auto-resolves guards with Function.length < 3 via `guardToPromiseFn`.
    // In Vue Router 5.0.3+, the `next` callback passed to guards is wrapped with
    // `withDeprecationWarning()`, so calling it emits a console warning. We avoid
    // calling it on modern routers where it is both unnecessary and noisy.
    if (isLegacyRouter) {
      const next = rest[0];
      if (typeof next === 'function') {
        next();
      }
    }
  });
}

function getActivePageLoadSpan(): Span | undefined {
  const span = getActiveSpan();
  const rootSpan = span && getRootSpan(span);

  if (!rootSpan) {
    return undefined;
  }

  const op = spanToJSON(rootSpan).op;

  return op === 'pageload' ? rootSpan : undefined;
}
