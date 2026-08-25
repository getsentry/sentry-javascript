import {
  browserTracingIntegration as originalBrowserTracingIntegration,
  getAbsoluteUrl,
  startBrowserTracingNavigationSpan,
  startBrowserTracingPageLoadSpan,
  WINDOW,
} from '@sentry/browser';
import {
  SENTRY_SEGMENT_NAME_SOURCE,
  PARAMS_KEY_BASE,
  URL_FULL,
  URL_PATH,
  URL_PATH_PARAMETER_KEY_BASE,
  URL_TEMPLATE,
} from '@sentry/conventions/attributes';
import type { Integration } from '@sentry/core';
import {
  hasSpanStreamingEnabled,
  PAGELOAD_SPAN_NAME_FALLBACK,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  filterCollectedUrl,
} from '@sentry/core';
import type { AnyRouter } from '@tanstack/vue-router';

type RouteMatch = ReturnType<AnyRouter['matchRoutes']>[number];

interface TanstackRouterLocation {
  pathname: string;
  search: Record<string, unknown>;
  state?: unknown;
}

interface TanstackRouterSubscribeArgs {
  toLocation: TanstackRouterLocation;
  fromLocation?: { state: unknown };
}

/**
 * A custom browser tracing integration for TanStack Router.
 *
 * The minimum compatible version of `@tanstack/vue-router` is `1.64.0`.
 *
 * @param router A TanStack Router `Router` instance that should be used for routing instrumentation.
 * @param options Sentry browser tracing configuration.
 */
export function tanstackRouterBrowserTracingIntegration<R extends AnyRouter>(
  router: R,
  options: Parameters<typeof originalBrowserTracingIntegration>[0] = {},
): Integration {
  const browserTracingIntegrationInstance = originalBrowserTracingIntegration({
    ...options,
    instrumentNavigation: false,
    instrumentPageLoad: false,
  });

  const { instrumentPageLoad = true, instrumentNavigation = true } = options;

  return {
    ...browserTracingIntegrationInstance,
    afterAllSetup(client) {
      browserTracingIntegrationInstance.afterAllSetup(client);

      const resolveRouteMatch = (pathname: string, search: unknown): RouteMatch | undefined => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const matchedRoutes = router.matchRoutes(pathname, search as any, { preload: false, throwOnError: false });
        const lastMatch = matchedRoutes[matchedRoutes.length - 1];
        // If we only match __root__, we ended up not matching any route at all, so
        // we fall back to the pathname.
        return lastMatch?.routeId !== '__root__' ? lastMatch : undefined;
      };

      const applyRouteMatch = (
        span: NonNullable<ReturnType<typeof startBrowserTracingPageLoadSpan>>,
        match: RouteMatch | undefined,
        toLocation: TanstackRouterLocation,
        fallbackName: string,
      ): void => {
        span.updateName(match ? match.routeId : fallbackName);
        span.setAttribute(SENTRY_SEGMENT_NAME_SOURCE, match ? 'route' : 'url');
        span.setAttributes({
          [URL_TEMPLATE]: match?.routeId,
          ...locationToSpanUrlAttributes(router, toLocation),
          ...routeMatchToParamSpanAttributes(match),
        });
      };

      const initialWindowLocation = WINDOW.location;
      if (instrumentPageLoad && initialWindowLocation) {
        const routeMatch = resolveRouteMatch(
          initialWindowLocation.pathname,
          router.options.parseSearch(initialWindowLocation.search),
        );

        const pageloadSpan = startBrowserTracingPageLoadSpan(client, {
          // With span streaming, span names have to be low cardinality, so we can't fall back to the URL.
          name: routeMatch
            ? routeMatch.routeId
            : hasSpanStreamingEnabled(client)
              ? PAGELOAD_SPAN_NAME_FALLBACK
              : initialWindowLocation.pathname,
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'pageload',
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.pageload.vue.tanstack_router',
            [SENTRY_SEGMENT_NAME_SOURCE]: routeMatch ? 'route' : 'url',
            ...(routeMatch && { [URL_TEMPLATE]: routeMatch.routeId }),
            ...routeMatchToParamSpanAttributes(routeMatch),
          },
        });

        // A redirect thrown during the initial pageload leaves the span named after the pre-redirect
        // route, so correct it to the resolved route once.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const unsubscribePageloadResolved = router.subscribe('onResolved', (onResolvedArgs: any) => {
          unsubscribePageloadResolved();
          if (!pageloadSpan) {
            return;
          }
          const { toLocation } = onResolvedArgs as TanstackRouterSubscribeArgs;
          const resolvedMatch = resolveRouteMatch(toLocation.pathname, toLocation.search);
          applyRouteMatch(
            pageloadSpan,
            resolvedMatch,
            toLocation,
            hasSpanStreamingEnabled(client) ? PAGELOAD_SPAN_NAME_FALLBACK : toLocation.pathname,
          );
        });
      }

      if (instrumentNavigation) {
        // Navigation is driven by `onBeforeLoad` (accurate start) + `onResolved` (final route), not
        // `onBeforeNavigate`, which TanStack stops firing after any loader redirect (TanStack/router#3920).
        // A redirect chain emits one `onBeforeLoad` per load but a single `onResolved`, so we start the
        // span on the first `onBeforeLoad`, rename it on later ones, and clear it on `onResolved`.
        let inFlightNavigationSpan: ReturnType<typeof startBrowserTracingNavigationSpan> | undefined;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        router.subscribe('onBeforeLoad', (onBeforeLoadArgs: any) => {
          const { toLocation, fromLocation } = onBeforeLoadArgs as TanstackRouterSubscribeArgs;
          // Skip the initial pageload (no fromLocation) and no-op reloads (same state).
          if (!fromLocation || toLocation.state === fromLocation.state) {
            return;
          }

          const routeMatch = resolveRouteMatch(toLocation.pathname, toLocation.search);
          // In SSR/non-browser contexts, WINDOW.location may be undefined, so fall back to the router's location.
          const fallbackName = WINDOW.location?.pathname || toLocation.pathname;

          if (inFlightNavigationSpan) {
            // Redirect continuation within the same navigation: keep the span, update the target.
            applyRouteMatch(inFlightNavigationSpan, routeMatch, toLocation, fallbackName);
            return;
          }

          inFlightNavigationSpan = startBrowserTracingNavigationSpan(
            client,
            {
              name: routeMatch ? routeMatch.routeId : fallbackName,
              attributes: {
                [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
                [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.vue.tanstack_router',
                [SENTRY_SEGMENT_NAME_SOURCE]: routeMatch ? 'route' : 'url',
                ...(routeMatch && { [URL_TEMPLATE]: routeMatch.routeId }),
                ...routeMatchToParamSpanAttributes(routeMatch),
              },
            },
            { url: locationToAbsoluteUrl(router, toLocation) },
          );
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        router.subscribe('onResolved', (onResolvedArgs: any) => {
          const span = inFlightNavigationSpan;
          inFlightNavigationSpan = undefined;
          if (!span) {
            return;
          }
          const { toLocation } = onResolvedArgs as TanstackRouterSubscribeArgs;
          const resolvedMatch = resolveRouteMatch(toLocation.pathname, toLocation.search);
          applyRouteMatch(span, resolvedMatch, toLocation, WINDOW.location?.pathname || toLocation.pathname);
        });
      }
    },
  };
}

function locationToAbsoluteUrl<R extends AnyRouter>(router: R, location: TanstackRouterLocation): string {
  const search = router.options.stringifySearch(location.search);
  const pathWithSearch = `${location.pathname}${search && search !== '?' ? search : ''}`;

  return getAbsoluteUrl(pathWithSearch);
}

function locationToSpanUrlAttributes<R extends AnyRouter>(
  router: R,
  location: TanstackRouterLocation,
): Record<string, string> {
  const absoluteUrl = locationToAbsoluteUrl(router, location);

  return {
    [URL_PATH]: location.pathname,
    [URL_FULL]: filterCollectedUrl(absoluteUrl),
  };
}

function routeMatchToParamSpanAttributes(match: RouteMatch | undefined): Record<string, string> {
  if (!match) {
    return {};
  }

  const paramAttributes: Record<string, string> = {};
  Object.entries(match.params as Record<string, string>).forEach(([key, value]) => {
    paramAttributes[`${URL_PATH_PARAMETER_KEY_BASE}.${key}`] = value;
    paramAttributes[`${PARAMS_KEY_BASE}.${key}`] = value; // params.[key] is an alias
  });

  return paramAttributes;
}
