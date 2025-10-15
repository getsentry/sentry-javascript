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
import type { AnyRouter } from '@tanstack/solid-router';

type RouteMatch = ReturnType<AnyRouter['matchRoutes']>[number];

/**
 * A custom browser tracing integration for TanStack Router.
 *
 * The minimum compatible version of `@tanstack/solid-router` is `1.64.0
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

      const initialWindowLocation = WINDOW.location;
      if (instrumentPageLoad && initialWindowLocation) {
        const matchedRoutes = router.matchRoutes(
          initialWindowLocation.pathname,
          router.options.parseSearch(initialWindowLocation.search),
          { preload: false, throwOnError: false },
        );

        const lastMatch = matchedRoutes[matchedRoutes.length - 1];

        startBrowserTracingPageLoadSpan(client, {
          name: lastMatch ? lastMatch.routeId : initialWindowLocation.pathname,
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'pageload',
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.pageload.solid.tanstack_router',
            [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: lastMatch ? 'route' : 'url',
            ...routeMatchToParamSpanAttributes(lastMatch),
          },
        });
      }

      if (instrumentNavigation) {
        // The onBeforeNavigate hook is called at the very beginning of a navigation and is only called once per navigation, even when the user is redirected
        router.subscribe('onBeforeNavigate', onBeforeNavigateArgs => {
          // onBeforeNavigate is called during pageloads. We can avoid creating navigation spans by comparing the states of the to and from arguments.
          if (onBeforeNavigateArgs.toLocation.state === onBeforeNavigateArgs.fromLocation?.state) {
            return;
          }

          const onResolvedMatchedRoutes = router.matchRoutes(
            onBeforeNavigateArgs.toLocation.pathname,
            onBeforeNavigateArgs.toLocation.search,
            { preload: false, throwOnError: false },
          );

          const onBeforeNavigateLastMatch = onResolvedMatchedRoutes[onResolvedMatchedRoutes.length - 1];

          const navigationLocation = WINDOW.location;
          const navigationSpan = startBrowserTracingNavigationSpan(client, {
            name: onBeforeNavigateLastMatch ? onBeforeNavigateLastMatch.routeId : navigationLocation.pathname,
            attributes: {
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.solid.tanstack_router',
              [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: onBeforeNavigateLastMatch ? 'route' : 'url',
            },
          });

          // In case the user is redirected during navigation we want to update the span with the right value.
          const unsubscribeOnResolved = router.subscribe('onResolved', onResolvedArgs => {
            unsubscribeOnResolved();
            if (navigationSpan) {
              const onResolvedMatchedRoutes = router.matchRoutes(
                onResolvedArgs.toLocation.pathname,
                onResolvedArgs.toLocation.search,
                { preload: false, throwOnError: false },
              );

              const onResolvedLastMatch = onResolvedMatchedRoutes[onResolvedMatchedRoutes.length - 1];

              if (onResolvedLastMatch) {
                navigationSpan.updateName(onResolvedLastMatch.routeId);
                navigationSpan.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'route');
                navigationSpan.setAttributes(routeMatchToParamSpanAttributes(onResolvedLastMatch));
              }
            }
          });
        });
      }
    },
  };
}

function routeMatchToParamSpanAttributes(match: RouteMatch | undefined): Record<string, string> {
  if (!match) {
    return {};
  }

  const paramAttributes: Record<string, string> = {};
  Object.entries(match.params as Record<string, string>).forEach(([key, value]) => {
    paramAttributes[`url.path.parameter.${key}`] = value;
    paramAttributes[`params.${key}`] = value; // params.[key] is an alias
  });

  return paramAttributes;
}
