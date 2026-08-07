import { getAbsoluteUrl, startBrowserTracingNavigationSpan } from '@sentry/browser';
import type { Span } from '@sentry/core';
import {
  debug,
  getActiveSpan,
  getClient,
  getRootSpan,
  GLOBAL_OBJ,
  isThenable,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  spanToJSON,
} from '@sentry/core';
import type { DataRouter } from 'react-router';
import { DEBUG_BUILD } from '../common/debug-build';
import { isClientInstrumentationApiUsed } from './createClientInstrumentation';
import {
  finalizeNavigationSpanFromRouterState,
  getParameterizedRoute,
  normalizePathname,
  resolveNavigateAbsoluteUrl,
  resolveNavigateArg,
} from './utils';
import { SENTRY_OP, URL_PATH, URL_TEMPLATE } from '@sentry/conventions/attributes';

const GLOBAL_OBJ_WITH_DATA_ROUTER = GLOBAL_OBJ as typeof GLOBAL_OBJ & {
  __reactRouterDataRouter?: DataRouter;
};

const WINDOW = GLOBAL_OBJ as typeof GLOBAL_OBJ & Window;

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
        const pageloadName = spanToJSON(pageloadSpan).name;
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
            [URL_TEMPLATE]: parameterizePageloadRoute,
          });
        }
      }

      // Patching navigate for creating accurate navigation transactions
      if (typeof router.navigate === 'function') {
        const originalNav = router.navigate.bind(router);
        router.navigate = function sentryPatchedNavigate(...args) {
          // Skip if instrumentation API is enabled (it handles navigation spans itself)
          if (!isClientInstrumentationApiUsed()) {
            const target = args[0];

            if (typeof target === 'number') {
              // navigate(0) triggers a reload, not a route change — skip span creation
              if (target !== 0) {
                const currentPathname = WINDOW.location?.pathname || '/';
                const navigationSpan = maybeCreateNavigationTransaction(
                  currentPathname,
                  getAbsoluteUrl(currentPathname),
                  'url',
                );

                const result = originalNav(...args);

                // Numeric navigations (`navigate(-1)`/`navigate(1)`) don't carry a destination
                // path, so we can only resolve the real URL/route once the router has settled.
                if (navigationSpan) {
                  // Finalize from the (updated) router state after navigation completes, in both
                  // the resolve and reject paths, so a rejected navigation still ends up with the
                  // correct URL attributes instead of the placeholder start pathname.
                  if (isThenable(result)) {
                    result.then(
                      () => finalizeNavigationSpanFromRouterState(navigationSpan, router.state),
                      () => finalizeNavigationSpanFromRouterState(navigationSpan, router.state),
                    );
                  } else {
                    finalizeNavigationSpanFromRouterState(navigationSpan, router.state);
                  }
                }

                return result;
              }
            } else {
              maybeCreateNavigationTransaction(
                resolveNavigateArg(target) || '<unknown route>',
                resolveNavigateAbsoluteUrl(target),
                'url',
              );
            }
          }
          return originalNav(...args);
        };
      }

      // Subscribe to router state changes to update navigation transactions (and any pageload
      // whose route info only became available after `trySubscribe`, e.g. lazy routes) with the
      // parameterized route.
      router.subscribe(newState => {
        const rootSpan = getActiveRootSpan();

        if (!rootSpan) {
          return;
        }

        const rootSpanJson = spanToJSON(rootSpan);
        const rootSpanAttributes = rootSpanJson.attributes;

        // When the instrumentation API is active, navigation roots are parameterized
        // by the native route hooks
        if (
          rootSpanAttributes[SENTRY_OP] === 'navigation' &&
          isClientInstrumentationApiUsed() &&
          rootSpanAttributes[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE] === 'route'
        ) {
          return;
        }

        const rootSpanName = rootSpanJson.name;
        const parameterizedRoute = getParameterizedRoute(newState);
        const spanPathname = rootSpanAttributes[URL_PATH] as string | undefined;
        const destinationPathname = normalizePathname(newState.location.pathname);

        if (
          rootSpanName &&
          newState.navigation.state === 'idle' && // navigation has completed
          // this event is for the currently active root span
          (destinationPathname === normalizePathname(rootSpanName) ||
            (spanPathname && destinationPathname === normalizePathname(spanPathname)))
        ) {
          rootSpan.updateName(parameterizedRoute);
          rootSpan.setAttributes({
            [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
            [URL_TEMPLATE]: parameterizedRoute,
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

function maybeCreateNavigationTransaction(name: string, url: string, source: 'url' | 'route'): Span | undefined {
  const client = getClient();

  if (!client) {
    return undefined;
  }

  return startBrowserTracingNavigationSpan(
    client,
    {
      name,
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: source,
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.react_router',
        ...(source === 'route' ? { [URL_TEMPLATE]: name } : {}),
      },
    },
    { url },
  );
}

function getActiveRootSpan(): Span | undefined {
  const activeSpan = getActiveSpan();
  if (!activeSpan) {
    return undefined;
  }

  const rootSpan = getRootSpan(activeSpan);

  const op = spanToJSON(rootSpan).attributes[SENTRY_OP];

  // Only use this root span if it is a pageload or navigation span
  return op === 'navigation' || op === 'pageload' ? rootSpan : undefined;
}
