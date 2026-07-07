import {
  browserTracingIntegration as originalBrowserTracingIntegration,
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

/**
 * A custom browser tracing integration for TanStack Router.
 *
 * The minimum compatible version of `@tanstack/react-router` is `1.64.0`.
 *
 * @param router A TanStack Router `Router` instance that should be used for routing instrumentation.
 * @param options Sentry browser tracing configuration.
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
          const resolvedMatch = resolveRouteMatch(onResolvedArgs.toLocation.pathname, onResolvedArgs.toLocation.search);
          if (resolvedMatch && resolvedMatch.routeId !== routeMatch?.routeId) {
            pageloadSpan.updateName(resolvedMatch.routeId);
            pageloadSpan.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'route');
            pageloadSpan.setAttributes(routeMatchToParamSpanAttributes(resolvedMatch));
          }
        });
      }

      if (instrumentNavigation) {
        // Navigation is driven by `onBeforeLoad` (accurate start) + `onResolved` (final route), not
        // `onBeforeNavigate`, which TanStack stops firing after any loader redirect (TanStack/router#3920).
        // A redirect chain emits one `onBeforeLoad` per load but a single `onResolved`, so we start the
        // span on the first `onBeforeLoad`, rename it on later ones, and clear it on `onResolved`.
        let inFlightNavigationSpan: ReturnType<typeof startBrowserTracingNavigationSpan> | undefined;

        const applyRouteMatch = (
          span: NonNullable<typeof inFlightNavigationSpan>,
          match: VendoredTanstackRouterRouteMatch | undefined,
          fallbackName: string,
        ): void => {
          span.updateName(match ? match.routeId : fallbackName);
          span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, match ? 'route' : 'url');
          span.setAttributes(routeMatchToParamSpanAttributes(match));
        };

        castRouterInstance.subscribe('onBeforeLoad', onBeforeLoadArgs => {
          // Skip the initial pageload (no fromLocation) and no-op reloads (same state).
          if (
            !onBeforeLoadArgs.fromLocation ||
            onBeforeLoadArgs.toLocation.state === onBeforeLoadArgs.fromLocation.state
          ) {
            return;
          }

          const routeMatch = resolveRouteMatch(
            onBeforeLoadArgs.toLocation.pathname,
            onBeforeLoadArgs.toLocation.search,
          );
          const fallbackName = WINDOW.location.pathname;

          if (inFlightNavigationSpan) {
            // Redirect continuation within the same navigation: keep the span, update the target.
            applyRouteMatch(inFlightNavigationSpan, routeMatch, fallbackName);
            return;
          }

          inFlightNavigationSpan = startBrowserTracingNavigationSpan(client, {
            name: routeMatch ? routeMatch.routeId : fallbackName,
            attributes: {
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.react.tanstack_router',
              [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: routeMatch ? 'route' : 'url',
              ...routeMatchToParamSpanAttributes(routeMatch),
            },
          });
        });

        castRouterInstance.subscribe('onResolved', onResolvedArgs => {
          const span = inFlightNavigationSpan;
          inFlightNavigationSpan = undefined;
          if (!span) {
            return;
          }
          const resolvedMatch = resolveRouteMatch(onResolvedArgs.toLocation.pathname, onResolvedArgs.toLocation.search);
          if (resolvedMatch) {
            applyRouteMatch(span, resolvedMatch, WINDOW.location.pathname);
          }
        });
      }
    },
  };
}

function routeMatchToParamSpanAttributes(match: VendoredTanstackRouterRouteMatch | undefined): Record<string, string> {
  if (!match) {
    return {};
  }

  const paramAttributes: Record<string, string> = {};
  Object.entries(match.params).forEach(([key, value]) => {
    paramAttributes[`url.path.params.${key}`] = value; // TODO(v11): remove attribute which does not adhere to Sentry's semantic convention
    paramAttributes[`url.path.parameter.${key}`] = value;
    paramAttributes[`params.${key}`] = value; // params.[key] is an alias
  });

  return paramAttributes;
}
