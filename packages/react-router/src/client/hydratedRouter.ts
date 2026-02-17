import { startBrowserTracingNavigationSpan } from '@sentry/browser';
import type { Span } from '@sentry/core';
import {
  debug,
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
import { DEBUG_BUILD } from '../common/debug-build';
import { isClientInstrumentationApiUsed } from './createClientInstrumentation';

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
      const pageloadSpan = getActiveRootSpan();

      if (pageloadSpan) {
        const pageloadName = spanToJSON(pageloadSpan).description;
        const parameterizePageloadRoute = getParameterizedRoute(router.state);
        if (
          pageloadName &&
          // this event is for the currently active pageload
          normalizePathname(router.state.location.pathname) === normalizePathname(pageloadName)
        ) {
          pageloadSpan.updateName(parameterizePageloadRoute);
          pageloadSpan.setAttributes({
            [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.pageload.react_router',
          });
        }
      }

      // Patching navigate for creating accurate navigation transactions
      if (typeof router.navigate === 'function') {
        const originalNav = router.navigate.bind(router);
        router.navigate = function sentryPatchedNavigate(...args) {
          // Skip if instrumentation API is enabled (it handles navigation spans itself)
          if (!isClientInstrumentationApiUsed()) {
            maybeCreateNavigationTransaction(String(args[0]) || '<unknown route>', 'url');
          }
          return originalNav(...args);
        };
      }

      // Subscribe to router state changes to update navigation transactions with parameterized routes
      router.subscribe(newState => {
        const navigationSpan = getActiveRootSpan();

        if (!navigationSpan) {
          return;
        }

        const navigationSpanName = spanToJSON(navigationSpan).description;
        const parameterizedNavRoute = getParameterizedRoute(newState);

        if (
          navigationSpanName &&
          newState.navigation.state === 'idle' && // navigation has completed
          // this event is for the currently active navigation
          normalizePathname(newState.location.pathname) === normalizePathname(navigationSpanName)
        ) {
          navigationSpan.updateName(parameterizedNavRoute);
          navigationSpan.setAttributes({
            [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.react_router',
          });
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
        if (retryCount >= MAX_RETRIES) {
          DEBUG_BUILD && debug.warn('Unable to instrument React Router: router not found after hydration.');
        }
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
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.react_router',
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
  return normalizePathname(lastMatch?.route.path ?? routerState.location.pathname);
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
