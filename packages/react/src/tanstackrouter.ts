import {
  browserTracingIntegration as originalBrowserTracingIntegration,
  getAbsoluteUrl,
  startBrowserTracingNavigationSpan,
  startBrowserTracingPageLoadSpan,
  WINDOW,
} from '@sentry/browser';
import type { Integration } from '@sentry/core/browser';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
} from '@sentry/core/browser';
import type { VendoredTanstackRouter, VendoredTanstackRouterRouteMatch } from './vendor/tanstackrouter-types';
import { PARAMS_KEY, URL_FULL, URL_PATH, URL_PATH_PARAMETER_KEY, URL_TEMPLATE } from '@sentry/conventions/attributes';

interface TanstackRouterLocation {
  pathname: string;
  search: Record<string, unknown>;
  state?: unknown;
}

/**
 * A custom browser tracing integration for TanStack Router.
 *
 * The minimum compatible version of `@tanstack/react-router` is `1.64.0`.
 *
 * Import from `@sentry/react/tanstackrouter` (not the package root) so this code is not
 * part of the main `@sentry/react` export list. That keeps dynamic
 * `import('@sentry/react')` namespaces tree-shakeable.
 *
 * @param router A TanStack Router `Router` instance that should be used for routing instrumentation.
 * @param options Sentry browser tracing configuration.
 *
 * @example
 * ```ts
 * import { init, addIntegration } from '@sentry/react';
 * import { tanstackRouterBrowserTracingIntegration } from '@sentry/react/tanstackrouter';
 *
 * init({ dsn: '...' });
 *
 * // Safe to defer: only the tanstack subpath is loaded
 * void import('@sentry/react/tanstackrouter').then(({ tanstackRouterBrowserTracingIntegration }) => {
 *   addIntegration(tanstackRouterBrowserTracingIntegration(router));
 * });
 * ```
 */
export function tanstackRouterBrowserTracingIntegration(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  router: any, // This is `any` because we don't want any type mismatches if TanStack Router changes their types
  options: Parameters<typeof originalBrowserTracingIntegration>[0] = {},
): Integration {
  const castRouterInstance: VendoredTanstackRouter = router;

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

      const resolveRouteMatch = (pathname: string, search: unknown): VendoredTanstackRouterRouteMatch | undefined => {
        const matchedRoutes = castRouterInstance.matchRoutes(pathname, search as {}, {
          preload: false,
          throwOnError: false,
        });
        const lastMatch = matchedRoutes[matchedRoutes.length - 1];
        // If we only match __root__, we ended up not matching any route at all, so
        // we fall back to the pathname.
        return lastMatch?.routeId !== '__root__' ? lastMatch : undefined;
      };

      const applyRouteMatch = (
        span: NonNullable<ReturnType<typeof startBrowserTracingPageLoadSpan>>,
        match: VendoredTanstackRouterRouteMatch | undefined,
        toLocation: TanstackRouterLocation,
        fallbackName: string,
      ): void => {
        span.updateName(match ? match.routeId : fallbackName);
        span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, match ? 'route' : 'url');
        span.setAttributes({
          ...(match && { [URL_TEMPLATE]: match.routeId }),
          ...locationToSpanUrlAttributes(castRouterInstance, toLocation),
          ...routeMatchToParamSpanAttributes(match),
        });
      };

      const initialWindowLocation = WINDOW.location;
      if (instrumentPageLoad && initialWindowLocation) {
        const routeMatch = resolveRouteMatch(
          initialWindowLocation.pathname,
          castRouterInstance.options.parseSearch(initialWindowLocation.search),
        );

        const pageloadSpan = startBrowserTracingPageLoadSpan(client, {
          name: routeMatch ? routeMatch.routeId : initialWindowLocation.pathname,
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'pageload',
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.pageload.react.tanstack_router',
            [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: routeMatch ? 'route' : 'url',
            ...(routeMatch && { [URL_TEMPLATE]: routeMatch.routeId }),
            ...routeMatchToParamSpanAttributes(routeMatch),
          },
        });

        // A redirect thrown during the initial pageload leaves the span named after the pre-redirect
        // route, so correct it to the resolved route once.
        const unsubscribePageloadResolved = castRouterInstance.subscribe('onResolved', onResolvedArgs => {
          unsubscribePageloadResolved();
          if (!pageloadSpan) {
            return;
          }
          const { toLocation } = onResolvedArgs;
          const resolvedMatch = resolveRouteMatch(toLocation.pathname, toLocation.search);
          applyRouteMatch(pageloadSpan, resolvedMatch, toLocation, toLocation.pathname);
        });
      }

      if (instrumentNavigation) {
        // Navigation is driven by `onBeforeLoad` (accurate start) + `onResolved` (final route), not
        // `onBeforeNavigate`, which TanStack stops firing after any loader redirect (TanStack/router#3920).
        // A redirect chain emits one `onBeforeLoad` per load but a single `onResolved`, so we start the
        // span on the first `onBeforeLoad`, rename it on later ones, and clear it on `onResolved`.
        let inFlightNavigationSpan: ReturnType<typeof startBrowserTracingNavigationSpan> | undefined;

        castRouterInstance.subscribe('onBeforeLoad', onBeforeLoadArgs => {
          const { toLocation, fromLocation } = onBeforeLoadArgs;
          // Skip the initial pageload (no fromLocation) and no-op reloads (same state).
          if (!fromLocation || toLocation.state === fromLocation.state) {
            return;
          }

          const routeMatch = resolveRouteMatch(toLocation.pathname, toLocation.search);
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
                [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.react.tanstack_router',
                [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: routeMatch ? 'route' : 'url',
                ...(routeMatch && { [URL_TEMPLATE]: routeMatch.routeId }),
                ...routeMatchToParamSpanAttributes(routeMatch),
              },
            },
            { url: locationToAbsoluteUrl(castRouterInstance, toLocation) },
          );
        });

        castRouterInstance.subscribe('onResolved', onResolvedArgs => {
          const span = inFlightNavigationSpan;
          inFlightNavigationSpan = undefined;
          if (!span) {
            return;
          }
          const { toLocation } = onResolvedArgs;
          const resolvedMatch = resolveRouteMatch(toLocation.pathname, toLocation.search);
          if (resolvedMatch) {
            applyRouteMatch(span, resolvedMatch, toLocation, WINDOW.location?.pathname || toLocation.pathname);
          }
        });
      }
    },
  };
}

function locationToAbsoluteUrl(router: VendoredTanstackRouter, location: TanstackRouterLocation): string {
  const search = router.options.stringifySearch?.(location.search) ?? '';
  const pathWithSearch = `${location.pathname}${search && search !== '?' ? search : ''}`;

  return getAbsoluteUrl(pathWithSearch);
}

function locationToSpanUrlAttributes(
  router: VendoredTanstackRouter,
  location: TanstackRouterLocation,
): Record<string, string> {
  const absoluteUrl = locationToAbsoluteUrl(router, location);

  return {
    [URL_PATH]: location.pathname,
    [URL_FULL]: absoluteUrl,
  };
}

function routeMatchToParamSpanAttributes(match: VendoredTanstackRouterRouteMatch | undefined): Record<string, string> {
  if (!match) {
    return {};
  }

  const paramAttributes: Record<string, string> = {};
  Object.entries(match.params).forEach(([key, value]) => {
    paramAttributes[`url.path.params.${key}`] = value; // TODO(v11): remove attribute which does not adhere to Sentry's semantic convention
    paramAttributes[URL_PATH_PARAMETER_KEY.replace('<key>', key)] = value;
    paramAttributes[PARAMS_KEY.replace('<key>', key)] = value; // params.[key] is an alias
  });

  return paramAttributes;
}
