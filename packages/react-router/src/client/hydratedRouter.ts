import { startBrowserTracingNavigationSpan } from '@sentry/browser';
import type { Span } from '@sentry/core';
import {
  getActiveSpan,
  getClient,
  getRootSpan,
  GLOBAL_OBJ,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  spanToJSON,
} from '@sentry/core';
import type { DataRouter, RouterState } from 'react-router';

const GLOBAL_OBJ_WITH_DATA_ROUTER = GLOBAL_OBJ as typeof GLOBAL_OBJ & {
  __reactRouterDataRouter?: DataRouter;
};

const MAX_RETRIES = 40; // 2 seconds at 50ms interval

/**
 * Instruments the React Router Data Router for pageloads and navigation.
 *
 * This function waits for the router to be available after hydration, then:
 * 1. Updates the pageload transaction with parameterized route info
 * 2. Patches router.navigate() to create navigation transactions
 * 3. Subscribes to router state changes to update navigation transactions with parameterized routes
 */
export function instrumentHydratedRouter(): void {
  function trySubscribe(): boolean {
    const router = GLOBAL_OBJ_WITH_DATA_ROUTER.__reactRouterDataRouter;

    if (router) {
      // The first time we hit the router, we try to update the pageload transaction
      // todo: update pageload tx here
      const pageloadSpan = getActiveRootSpan();
      const pageloadName = pageloadSpan ? spanToJSON(pageloadSpan).description : undefined;
      const parameterizePageloadRoute = getParameterizedRoute(router.state);
      if (
        pageloadName &&
        normalizePathname(router.state.location.pathname) === normalizePathname(pageloadName) && // this event is for the currently active pageload
        normalizePathname(parameterizePageloadRoute) !== normalizePathname(pageloadName) // route is not parameterized yet
      ) {
        pageloadSpan?.updateName(parameterizePageloadRoute);
        pageloadSpan?.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'route');
      }

      // Patching navigate for creating accurate navigation transactions
      if (typeof router.navigate === 'function') {
        const originalNav = router.navigate.bind(router);
        router.navigate = function patchedNavigate(...args) {
          maybeCreateNavigationTransaction(
            String(args[0]) || '<unknown route>', // will be updated anyway
            'url', // this also will be updated once we have the parameterized route
          );
          return originalNav(...args);
        };
      }

      // Subscribe to router state changes to update navigation transactions with parameterized routes
      router.subscribe(newState => {
        const navigationSpan = getActiveRootSpan();
        const navigationSpanName = navigationSpan ? spanToJSON(navigationSpan).description : undefined;
        const parameterizedNavRoute = getParameterizedRoute(newState);

        if (
          navigationSpanName && // we have an active pageload tx
          newState.navigation.state === 'idle' && // navigation has completed
          normalizePathname(newState.location.pathname) === normalizePathname(navigationSpanName) && // this event is for the currently active navigation
          normalizePathname(parameterizedNavRoute) !== normalizePathname(navigationSpanName) // route is not parameterized yet
        ) {
          navigationSpan?.updateName(parameterizedNavRoute);
          navigationSpan?.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'route');
        }
      });
      return true;
    }
    return false;
  }

  // Wait until the router is available (since the SDK loads before hydration)
  if (!trySubscribe()) {
    let retryCount = 0;
    // Retry until the router is available or max retries reached
    const interval = setInterval(() => {
      if (trySubscribe() || retryCount >= MAX_RETRIES) {
        clearInterval(interval);
      }
      retryCount++;
    }, 50);
  }
}

function maybeCreateNavigationTransaction(name: string, source: 'url' | 'route'): Span | undefined {
  const client = getClient();

  if (!client) {
    return undefined;
  }

  return startBrowserTracingNavigationSpan(client, {
    name,
    attributes: {
      [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: source,
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.react-router',
    },
  });
}

function getActiveRootSpan(): Span | undefined {
  const activeSpan = getActiveSpan();
  if (!activeSpan) {
    return undefined;
  }

  const rootSpan = getRootSpan(activeSpan);

  const op = spanToJSON(rootSpan).op;

  // Only use this root span if it is a pageload or navigation span
  return op === 'navigation' || op === 'pageload' ? rootSpan : undefined;
}

function getParameterizedRoute(routerState: RouterState): string {
  const lastMatch = routerState.matches[routerState.matches.length - 1];
  return lastMatch?.route.path ?? routerState.location.pathname;
}

function normalizePathname(pathname: string): string {
  // Ensure it starts with a single slash
  let normalized = pathname.startsWith('/') ? pathname : `/${pathname}`;
  // Remove trailing slash unless it's the root
  if (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}
