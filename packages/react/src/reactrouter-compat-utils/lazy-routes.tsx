import { WINDOW } from '@sentry/browser';
import type { Span } from '@sentry/core';
import { addNonEnumerableProperty, debug, isThenable } from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build';
import type { Location, RouteObject } from '../types';
import { getActiveRootSpan, getNavigationContext } from './utils';

/**
 * Captures location at invocation time. Prefers navigation context over window.location
 * since window.location hasn't updated yet when async handlers are invoked.
 */
function captureCurrentLocation(): Location | null {
  const navContext = getNavigationContext();
  // Only use navigation context if targetPath is defined (it can be undefined
  // if patchRoutesOnNavigation was invoked without a path argument)
  if (navContext?.targetPath) {
    return {
      pathname: navContext.targetPath,
      search: '',
      hash: '',
      state: null,
      key: 'default',
    };
  }

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
 * Captures the active span at invocation time. Prefers navigation context span
 * to ensure we update the correct span even if another navigation starts.
 */
function captureActiveSpan(): Span | undefined {
  const navContext = getNavigationContext();
  if (navContext) {
    return navContext.span;
  }
  return getActiveRootSpan();
}

/**
 * Creates a proxy wrapper for an async handler function.
 * Captures both the location and the active span at invocation time to ensure
 * the correct span is updated when the handler resolves.
 */
export function createAsyncHandlerProxy(
  originalFunction: (...args: unknown[]) => unknown,
  route: RouteObject,
  handlerKey: string,
  processResolvedRoutes: (
    resolvedRoutes: RouteObject[],
    parentRoute?: RouteObject,
    currentLocation?: Location,
    capturedSpan?: Span,
  ) => void,
): (...args: unknown[]) => unknown {
  const proxy = new Proxy(originalFunction, {
    apply(target: (...args: unknown[]) => unknown, thisArg, argArray) {
      const locationAtInvocation = captureCurrentLocation();
      const spanAtInvocation = captureActiveSpan();
      const result = target.apply(thisArg, argArray);
      handleAsyncHandlerResult(
        result,
        route,
        handlerKey,
        processResolvedRoutes,
        locationAtInvocation,
        spanAtInvocation,
      );
      return result;
    },
  });

  addNonEnumerableProperty(proxy, '__sentry_proxied__', true);

  return proxy;
}

/**
 * Handles the result of an async handler function call.
 * Passes the captured span through to ensure the correct span is updated.
 */
export function handleAsyncHandlerResult(
  result: unknown,
  route: RouteObject,
  handlerKey: string,
  processResolvedRoutes: (
    resolvedRoutes: RouteObject[],
    parentRoute?: RouteObject,
    currentLocation?: Location,
    capturedSpan?: Span,
  ) => void,
  currentLocation: Location | null,
  capturedSpan: Span | undefined,
): void {
  if (isThenable(result)) {
    (result as Promise<unknown>)
      .then((resolvedRoutes: unknown) => {
        if (Array.isArray(resolvedRoutes)) {
          processResolvedRoutes(resolvedRoutes, route, currentLocation ?? undefined, capturedSpan);
        }
      })
      .catch((e: unknown) => {
        DEBUG_BUILD && debug.warn(`Error resolving async handler '${handlerKey}' for route`, route, e);
      });
  } else if (Array.isArray(result)) {
    processResolvedRoutes(result, route, currentLocation ?? undefined, capturedSpan);
  }
}

/**
 * Recursively checks a route for async handlers and sets up Proxies to add discovered child routes to allRoutes when called.
 */
export function checkRouteForAsyncHandler(
  route: RouteObject,
  processResolvedRoutes: (
    resolvedRoutes: RouteObject[],
    parentRoute?: RouteObject,
    currentLocation?: Location,
    capturedSpan?: Span,
  ) => void,
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
