import { captureException, getAbsoluteUrl } from '@sentry/browser';
import {
  SENTRY_SEGMENT_NAME_SOURCE,
  NAVIGATION_ROUTE_ID,
  PARAMS_KEY_BASE,
  SENTRY_OP,
  URL_PATH_PARAMETER_KEY_BASE,
  URL_TEMPLATE,
} from '@sentry/conventions/attributes';
import { NAVIGATION } from '@sentry/conventions/op';
import type { RouteProvider, Span, SpanAttributes, StartSpanOptions, TransactionSource } from '@sentry/core';
import {
  createUrlRouteProvider,
  getActiveSpan,
  getClient,
  getCurrentScope,
  getRootSpan,
  hasSpanStreamingEnabled,
  NAVIGATION_SPAN_NAME_FALLBACK,
  PAGELOAD_SPAN_NAME_FALLBACK,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  spanToJSON,
} from '@sentry/core';

// The following type is an intersection of the Route type from VueRouter v2, v3, and v4.
// This is not great, but kinda necessary to make it work with all versions at the same time.
export type Route = {
  /** Unparameterized URL */
  path: string;
  /** Resolved URL including query and hash */
  fullPath?: string;
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
  // Vue Router 3 resolves to `{ route }`, Vue Router 4+ returns the route itself. Optional because
  // this interface is hand-rolled across Vue Router 2, 3 and 4+ rather than taken from the library.
  resolve?: (to: string) => Route | { route: Route };
}

/**
 * Builds a route provider backed by the Vue router's own matcher.
 */
export function createVueRouteProvider(router: VueRouter): RouteProvider {
  return createUrlRouteProvider(url => {
    const resolved = router.resolve?.(`${url.pathname}${url.search}${url.hash}`);
    if (!resolved) {
      return undefined;
    }

    const route = 'matched' in resolved ? resolved : resolved.route;

    // Always the matched path, never `route.name`, even under `routeLabel: 'name'`. Callers set
    // `url.template` from this and a route name is not a template. The navigation instrumentation
    // still names the span after the route name when the user asked for it.
    return route.matched[route.matched.length - 1]?.path;
  });
}

/**
 * The label for a matched route and where it came from, or `undefined` when nothing matched and only
 * the raw path is left.
 */
function getRouteLabel(
  route: Route,
  routeLabel: 'name' | 'path',
): { name: string; source: TransactionSource } | undefined {
  if (route.name && routeLabel !== 'path') {
    return { name: route.name.toString(), source: 'custom' };
  }

  const matchedPath = route.matched[route.matched.length - 1]?.path;

  return matchedPath ? { name: matchedPath, source: 'route' } : undefined;
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
  startNavigationSpanFn: (context: StartSpanOptions, destinationUrl: string) => void,
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
      attributes[`${URL_PATH_PARAMETER_KEY_BASE}.${key}`] = to.params[key];
      attributes[`${PARAMS_KEY_BASE}.${key}`] = to.params[key]; // params.[key] is an alias
    }
    for (const key of Object.keys(to.query)) {
      const value = to.query[key];
      if (value) {
        attributes[`query.${key}`] = value;
      }
    }

    // Determine a name for the routing transaction and where that name came from
    const routeLabel = getRouteLabel(to, options.routeLabel);
    const spanName = routeLabel?.name ?? to.path;
    const transactionSource: TransactionSource = routeLabel?.source ?? 'url';

    if (transactionSource === 'route') {
      attributes[URL_TEMPLATE] = spanName;
    }

    if (to.name) {
      attributes[NAVIGATION_ROUTE_ID] = to.name.toString();
    }

    getCurrentScope().setTransactionName(spanName);

    // Update the existing page load span with parametrized route information
    if (options.instrumentPageLoad && activePageLoadSpan) {
      const existingAttributes = spanToJSON(activePageLoadSpan).attributes;
      if (existingAttributes[SENTRY_SEGMENT_NAME_SOURCE] !== 'custom') {
        // With span streaming, span names have to be low cardinality, so we can't fall back to the URL.
        const client = getClient();
        const isUnparameterizedStreamedPageload =
          transactionSource === 'url' && !!client && hasSpanStreamingEnabled(client);
        activePageLoadSpan.updateName(isUnparameterizedStreamedPageload ? PAGELOAD_SPAN_NAME_FALLBACK : spanName);
        activePageLoadSpan.setAttribute(SENTRY_SEGMENT_NAME_SOURCE, transactionSource);
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
      // With span streaming, span names have to be low cardinality, so we can't fall back to the URL.
      // A route name (`custom`) or matched route path (`route`) is low cardinality, a raw path is not.
      const client = getClient();
      const isUnparameterizedStreamedNavigation =
        transactionSource === 'url' && !!client && hasSpanStreamingEnabled(client);

      startNavigationSpanFn(
        {
          name: isUnparameterizedStreamedNavigation ? NAVIGATION_SPAN_NAME_FALLBACK : spanName,
          attributes: {
            ...attributes,
            [SENTRY_OP]: NAVIGATION,
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.vue',
            [SENTRY_SEGMENT_NAME_SOURCE]: transactionSource,
          },
        },
        getAbsoluteUrl(to.fullPath ?? to.path),
      );
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

  const op = spanToJSON(rootSpan).attributes[SENTRY_OP];

  return op === 'pageload' ? rootSpan : undefined;
}
