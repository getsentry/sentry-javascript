import type { Context, HonoRoute } from './honoTypes';
import { isMiddleware } from './isMiddleware';
import { getMatchedHandlers, getRecordedRouteHandlerIndex } from './matchResult';

// Arity alone is enough here (unlike `wrapSubAppMiddleware` in patchRoute.ts, which also needs position)
// We only want the path, and inline middleware shares its handler's path.
function isRouteHandler(handler: unknown): boolean {
  return typeof handler === 'function' && !isMiddleware(handler);
}

// Hono 5 has no `c.req.matchedRoutes`.
function readMatchedRoutes(context: Context): HonoRoute[] {
  return context.req.matchedRoutes ?? getMatchedHandlers(context)?.map(([[, route]]) => route) ?? [];
}

/**
 * Returns the route path of the handler that responded, or `undefined` if no route matched.
 *
 * The last matched route is not enough, because a catch-all registered later would name every
 * request `/*`.
 */
export function resolveRouteName(context: Context): string | undefined {
  const routes = readMatchedRoutes(context);

  const recordedIndex = getRecordedRouteHandlerIndex(context);
  const recorded = recordedIndex === undefined ? undefined : routes[recordedIndex];
  if (recorded) {
    return recorded.path;
  }

  // Without a recorded index (manual setup before Hono 4.8), use `routeIndex`. Hono 4 leaves it on the
  // handler that responded.
  const current = routes[context.req.routeIndex];
  if (current && isRouteHandler(current.handler)) {
    return current.path;
  }

  // No route handler ran, for example because a middleware returned early.
  for (let i = routes.length - 1; i >= 0; i--) {
    const route = routes[i];
    if (route && isRouteHandler(route.handler)) {
      return route.path;
    }
  }

  // No handler matched (middleware-only path)
  // Final matched route: https://hono.dev/docs/helpers/route#using-with-index-parameter
  return routes.at(-1)?.path;
}
