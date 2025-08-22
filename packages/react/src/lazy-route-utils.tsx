import type { Span, TransactionSource } from '@sentry/core';
import { addNonEnumerableProperty, debug, SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, spanToJSON } from '@sentry/core';
import { DEBUG_BUILD } from './debug-build';
import { resolveRouteNameAndSource } from './reactrouterv6-compat-utils';
import type { Location, MatchRoutes, RouteMatch, RouteObject } from './types';

/**
 * Updates a navigation span with the correct route name after lazy routes have been loaded.
 */
export function updateNavigationSpanWithLazyRoutes(
  activeRootSpan: Span,
  location: Location,
  allRoutes: RouteObject[],
  forceUpdate = false,
  matchRoutes: MatchRoutes,
  rebuildRoutePathFromAllRoutes: (allRoutes: RouteObject[], location: Location) => string,
  locationIsInsideDescendantRoute: (location: Location, routes: RouteObject[]) => boolean,
  getNormalizedName: (
    routes: RouteObject[],
    location: Location,
    branches: RouteMatch[],
    basename?: string,
  ) => [string, TransactionSource],
  prefixWithSlash: (path: string) => string,
): void {
  // Check if this span has already been named to avoid multiple updates
  // But allow updates if this is a forced update (e.g., when lazy routes are loaded)
  const hasBeenNamed =
    !forceUpdate &&
    (
      activeRootSpan as {
        __sentry_navigation_name_set__?: boolean;
      }
    )?.__sentry_navigation_name_set__;

  if (!hasBeenNamed) {
    // Get fresh branches for the current location with all loaded routes
    const currentBranches = matchRoutes(allRoutes, location);
    const [name, source] = resolveRouteNameAndSource(
      location,
      allRoutes,
      allRoutes,
      (currentBranches as RouteMatch[]) || [],
      '',
      locationIsInsideDescendantRoute,
      rebuildRoutePathFromAllRoutes,
      getNormalizedName,
      prefixWithSlash,
    );

    // Only update if we have a valid name and the span hasn't finished
    const spanJson = spanToJSON(activeRootSpan);
    if (name && !spanJson.timestamp) {
      activeRootSpan.updateName(name);
      activeRootSpan.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, source);

      // Mark this span as having its name set to prevent future updates
      addNonEnumerableProperty(
        activeRootSpan as { __sentry_navigation_name_set__?: boolean },
        '__sentry_navigation_name_set__',
        true,
      );
    }
  }
}

/**
 * Creates a proxy wrapper for an async handler function.
 */
export function createAsyncHandlerProxy(
  originalFunction: (...args: unknown[]) => unknown,
  route: RouteObject,
  handlerKey: string,
  processResolvedRoutes: (resolvedRoutes: RouteObject[], parentRoute?: RouteObject, currentLocation?: Location) => void,
): (...args: unknown[]) => unknown {
  const proxy = new Proxy(originalFunction, {
    apply(target: (...args: unknown[]) => unknown, thisArg, argArray) {
      const result = target.apply(thisArg, argArray);
      handleAsyncHandlerResult(result, route, handlerKey, processResolvedRoutes);
      return result;
    },
  });

  addNonEnumerableProperty(proxy, '__sentry_proxied__', true);

  return proxy;
}

/**
 * Handles the result of an async handler function call.
 */
export function handleAsyncHandlerResult(
  result: unknown,
  route: RouteObject,
  handlerKey: string,
  processResolvedRoutes: (resolvedRoutes: RouteObject[], parentRoute?: RouteObject, currentLocation?: Location) => void,
): void {
  if (
    result &&
    typeof result === 'object' &&
    'then' in result &&
    typeof (result as Promise<unknown>).then === 'function'
  ) {
    (result as Promise<unknown>)
      .then((resolvedRoutes: unknown) => {
        if (Array.isArray(resolvedRoutes)) {
          processResolvedRoutes(resolvedRoutes, route);
        }
      })
      .catch((e: unknown) => {
        DEBUG_BUILD && debug.warn(`Error resolving async handler '${handlerKey}' for route`, route, e);
      });
  } else if (Array.isArray(result)) {
    processResolvedRoutes(result, route);
  }
}

/**
 * Recursively checks a route for async handlers and sets up Proxies to add discovered child routes to allRoutes when called.
 */
export function checkRouteForAsyncHandler(
  route: RouteObject,
  processResolvedRoutes: (resolvedRoutes: RouteObject[], parentRoute?: RouteObject, currentLocation?: Location) => void,
): void {
  // Set up proxies for any functions in the route's handle
  if (route.handle && typeof route.handle === 'object') {
    for (const key of Object.keys(route.handle)) {
      const maybeFn = route.handle[key];
      if (typeof maybeFn === 'function' && !(maybeFn as { __sentry_proxied__?: boolean }).__sentry_proxied__) {
        route.handle[key] = createAsyncHandlerProxy(maybeFn, route, key, processResolvedRoutes);
      }
    }
  }

  // Recursively check child routes
  if (Array.isArray(route.children)) {
    for (const child of route.children) {
      checkRouteForAsyncHandler(child, processResolvedRoutes);
    }
  }
}
