import { WINDOW, startBrowserTracingNavigationSpan, startBrowserTracingPageLoadSpan } from '@sentry/browser';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
} from '@sentry/core';

import { browserTracingIntegration as originalBrowserTracingIntegration } from '@sentry/browser';
import type { Integration } from '@sentry/types';

// The following types are vendored types from TanStack Router, so we don't have to depend on the actual package

export interface VendoredTanstackRouter {
  history: VendoredTanstackRouterHistory;
  state: VendoredTanstackRouterState;
  matchRoutes: (
    pathname: string,
    // eslint-disable-next-line @typescript-eslint/ban-types
    locationSearch: {},
    opts?: {
      preload?: boolean;
      throwOnError?: boolean;
    },
  ) => Array<VendoredTanstackRouterRouteMatch>;
  subscribe(
    eventType: 'onResolved',
    // eslint-disable-next-line @typescript-eslint/ban-types
    callback: (stateUpdate: { toLocation: { pathname: string; search: {} } }) => void,
  ): () => void;
}

export interface VendoredTanstackRouterHistory {
  subscribe: (cb: () => void) => () => void;
}

export interface VendoredTanstackRouterState {
  matches: Array<VendoredTanstackRouterRouteMatch>;
  pendingMatches?: Array<VendoredTanstackRouterRouteMatch>;
}

export interface VendoredTanstackRouterRouteMatch {
  routeId: string;
  pathname: string;
  params: { [key: string]: string };
}

/**
 * A custom browser tracing integration for TanStack Router.
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
          initialWindowLocation.search,
          { preload: false, throwOnError: false },
        );

        const lastMatch = matchedRoutes[matchedRoutes.length - 1];

        startBrowserTracingPageLoadSpan(client, {
          name: lastMatch ? lastMatch.routeId : initialWindowLocation.pathname,
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'pageload',
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.pageload.react.tanstack_router',
            [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: lastMatch ? 'route' : 'url',
            ...routeMatchToParamSpanAttributes(lastMatch),
          },
        });
      }

      if (instrumentNavigation) {
        castRouterInstance.history.subscribe(() => {
          const navigationLocation = WINDOW.location;
          const navigationSpan = startBrowserTracingNavigationSpan(client, {
            name: navigationLocation.pathname,
            attributes: {
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.react.tanstack_router',
              [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
            },
          });

          const unsubscribeOnResolved = castRouterInstance.subscribe('onResolved', stateUpdate => {
            unsubscribeOnResolved();
            if (navigationSpan) {
              const matchedRoutes = castRouterInstance.matchRoutes(
                stateUpdate.toLocation.pathname,
                stateUpdate.toLocation.search,
                { preload: false, throwOnError: false },
              );

              const lastMatch = matchedRoutes[matchedRoutes.length - 1];

              if (lastMatch) {
                navigationSpan.updateName(lastMatch.routeId);
                navigationSpan.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'route');
                navigationSpan.setAttributes(routeMatchToParamSpanAttributes(lastMatch));
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
  for (const key of Object.keys(match.params)) {
    paramAttributes[`params.${key}`] = match.params[key];
  }

  return paramAttributes;
}
