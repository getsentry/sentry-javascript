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
    locationSearch: unknown,
    opts?: {
      preload?: boolean;
      throwOnError?: boolean;
    },
  ) => Array<VendoredTanstackRouterRouteMatch>;
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

      const initialWindowLocationPathname = WINDOW.location && WINDOW.location.pathname;
      if (instrumentPageLoad && initialWindowLocationPathname) {
        const matchedRoutes = castRouterInstance.matchRoutes(
          initialWindowLocationPathname,
          {},
          { preload: false, throwOnError: false },
        );

        const lastMatch = matchedRoutes[matchedRoutes.length - 1];

        startBrowserTracingPageLoadSpan(client, {
          name: lastMatch ? lastMatch.routeId : initialWindowLocationPathname,
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
          const state = castRouterInstance.state;
          const matches = state.pendingMatches || state.matches;

          const lastMatch = matches[matches.length - 1];
          const routeId = lastMatch && lastMatch.routeId;

          const navigationPathname = WINDOW.location && WINDOW.location.pathname;

          startBrowserTracingNavigationSpan(client, {
            name: routeId || navigationPathname,
            attributes: {
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.react.tanstack_router',
              [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: routeId ? 'route' : 'url',
              ...routeMatchToParamSpanAttributes(lastMatch),
            },
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
