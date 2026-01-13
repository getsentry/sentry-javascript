import {
  browserTracingIntegration as originalBrowserTracingIntegration,
  startBrowserTracingNavigationSpan,
  startBrowserTracingPageLoadSpan,
  WINDOW,
} from '@sentry/browser';
import type { Integration } from '@sentry/core';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
} from '@sentry/core';
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

      const initialWindowLocation = WINDOW.location;
      if (instrumentPageLoad && initialWindowLocation) {
        const matchedRoutes = castRouterInstance.matchRoutes(
          initialWindowLocation.pathname,
          castRouterInstance.options.parseSearch(initialWindowLocation.search),
          { preload: false, throwOnError: false },
        );

        const lastMatch = matchedRoutes[matchedRoutes.length - 1];
        // If we only match __root__, we ended up not matching any route at all, so
        // we fall back to the pathname.
        const routeMatch = lastMatch?.routeId !== '__root__' ? lastMatch : undefined;

        startBrowserTracingPageLoadSpan(client, {
          name: routeMatch ? routeMatch.routeId : initialWindowLocation.pathname,
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'pageload',
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.pageload.react.tanstack_router',
            [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: routeMatch ? 'route' : 'url',
            ...routeMatchToParamSpanAttributes(routeMatch),
          },
        });
      }

      if (instrumentNavigation) {
        // The onBeforeNavigate hook is called at the very beginning of a navigation and is only called once per navigation, even when the user is redirected
        castRouterInstance.subscribe('onBeforeNavigate', onBeforeNavigateArgs => {
          // onBeforeNavigate is called during pageloads. We can avoid creating navigation spans by:
          // 1. Checking if there's no fromLocation (initial pageload)
          // 2. Comparing the states of the to and from arguments
          if (
            !onBeforeNavigateArgs.fromLocation ||
            onBeforeNavigateArgs.toLocation.state === onBeforeNavigateArgs.fromLocation.state
          ) {
            return;
          }

          const matchedRoutesOnBeforeNavigate = castRouterInstance.matchRoutes(
            onBeforeNavigateArgs.toLocation.pathname,
            onBeforeNavigateArgs.toLocation.search,
            { preload: false, throwOnError: false },
          );

          const onBeforeNavigateLastMatch = matchedRoutesOnBeforeNavigate[matchedRoutesOnBeforeNavigate.length - 1];
          const onBeforeNavigateRouteMatch =
            onBeforeNavigateLastMatch?.routeId !== '__root__' ? onBeforeNavigateLastMatch : undefined;

          const navigationLocation = WINDOW.location;
          const navigationSpan = startBrowserTracingNavigationSpan(client, {
            name: onBeforeNavigateRouteMatch ? onBeforeNavigateRouteMatch.routeId : navigationLocation.pathname,
            attributes: {
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.react.tanstack_router',
              [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: onBeforeNavigateRouteMatch ? 'route' : 'url',
            },
          });

          // In case the user is redirected during navigation we want to update the span with the right value.
          const unsubscribeOnResolved = castRouterInstance.subscribe('onResolved', onResolvedArgs => {
            unsubscribeOnResolved();
            if (navigationSpan) {
              const matchedRoutesOnResolved = castRouterInstance.matchRoutes(
                onResolvedArgs.toLocation.pathname,
                onResolvedArgs.toLocation.search,
                { preload: false, throwOnError: false },
              );

              const onResolvedLastMatch = matchedRoutesOnResolved[matchedRoutesOnResolved.length - 1];
              const onResolvedRouteMatch =
                onResolvedLastMatch?.routeId !== '__root__' ? onResolvedLastMatch : undefined;

              if (onResolvedRouteMatch) {
                navigationSpan.updateName(onResolvedRouteMatch.routeId);
                navigationSpan.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'route');
                navigationSpan.setAttributes(routeMatchToParamSpanAttributes(onResolvedRouteMatch));
              }
            }
          });
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
