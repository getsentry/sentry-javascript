import { captureException } from '@sentry/core';

// TanStack Router reports invalid search and path params through the same hook. They come from the URL, not from a
// bug in the app.
const VALIDATION_ERROR_NAMES = ['SearchParamError', 'PathParamError'];

type RouteLike = {
  options?: { onError?: (error: unknown) => void };
  children?: RouteLike[] | Record<string, RouteLike>;
};

function isValidationError(error: unknown): boolean {
  const name = (error as { constructor?: { name?: string } } | undefined)?.constructor?.name;
  return !!name && VALIDATION_ERROR_NAMES.includes(name);
}

function instrumentRoute(route: RouteLike, seen: Set<RouteLike>): void {
  if (!route || typeof route !== 'object' || seen.has(route)) {
    return;
  }
  seen.add(route);

  // A route with its own `onError` handles its errors itself, so reporting them is up to the app.
  const options = route.options;
  if (options && !options.onError) {
    options.onError = (error: unknown): void => {
      if (!isValidationError(error)) {
        captureException(error, { mechanism: { type: 'auto.function.tanstackstart.route', handled: false } });
      }
    };
  }

  const children = Array.isArray(route.children) ? route.children : Object.values(route.children || {});
  for (const child of children) {
    instrumentRoute(child, seen);
  }
}

/**
 * Captures errors that routes throw in `loader` and `beforeLoad` while the server renders a page. TanStack Router
 * catches these and renders the error component, so they reach neither the server entry nor the request middleware.
 * The route's `onError` option is the only place the router hands them to. Routes that set their own `onError` are
 * left alone.
 *
 * The Sentry Vite plugin calls this with the generated route tree in server builds.
 *
 * @internal
 */
export function instrumentServerRouteTree(routeTree: unknown): void {
  try {
    instrumentRoute(routeTree as RouteLike, new Set());
  } catch {
    // Never break the route tree module of the app.
  }
}
