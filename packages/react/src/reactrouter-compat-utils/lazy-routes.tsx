import { WINDOW } from '@sentry/browser';
import { addNonEnumerableProperty, debug, isThenable } from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build';
import type { Location, RouteObject } from '../types';

/**
 * Captures the current location at the time of invocation.
 */
function captureCurrentLocation(): Location | null {
  if (typeof WINDOW !== 'undefined') {
    try {
      const windowLocation = WINDOW.location;
      if (windowLocation) {
        return {
          pathname: windowLocation.pathname,
          search: windowLocation.search || '',
          hash: windowLocation.hash || '',
          state: null,
          key: 'default',
        };
      }
    } catch {
      DEBUG_BUILD && debug.warn('[React Router] Could not access window.location');
    }
  }
  return null;
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
      const locationAtInvocation = captureCurrentLocation();
      const result = target.apply(thisArg, argArray);
      handleAsyncHandlerResult(result, route, handlerKey, processResolvedRoutes, locationAtInvocation);
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
  currentLocation: Location | null,
): void {
  if (isThenable(result)) {
    (result as Promise<unknown>)
      .then((resolvedRoutes: unknown) => {
        if (Array.isArray(resolvedRoutes)) {
          processResolvedRoutes(resolvedRoutes, route, currentLocation ?? undefined);
        }
      })
      .catch((e: unknown) => {
        DEBUG_BUILD && debug.warn(`Error resolving async handler '${handlerKey}' for route`, route, e);
      });
  } else if (Array.isArray(result)) {
    processResolvedRoutes(result, route, currentLocation ?? undefined);
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
