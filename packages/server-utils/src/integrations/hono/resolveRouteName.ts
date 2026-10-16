import type { Context, HonoRoute } from './honoTypes';
import { isMiddleware } from './isMiddleware';
import { getMatchedHandlers, getRecordedRouteHandlerIndex } from './matchResult';

// Arity alone is enough here (unlike `wrapSubAppMiddleware` in patchRoute.ts, which also needs position)
// We only want the path, and inline middleware shares its handler's path.
function isRouteHandler(handler: unknown): boolean {
  return typeof handler === 'function' && !isMiddleware(handler);
}

// `c.req.matchedRoutes` exists on every Hono 4; Hono 5 removes it.
function readMatchedRoutes(context: Context): HonoRoute[] {
  return context.req.matchedRoutes ?? getMatchedHandlers(context)?.map(([[, route]]) => route) ?? [];
}

/**
 * Resolves the route path of the handler that responded, for the transaction name.
 *
 * Picking the handler (not just the last matched route) avoids two failure modes: a catch-all
 * registered after the handlers (the last route would be just `/*`), and a middleware that
 * short-circuits before the handler runs (`routeIndex` would point to the middleware).
 *
 * Returns `undefined` when the request has no matched routes.
 */
export function resolveRouteName(context: Context): string | undefined {
  const routes = readMatchedRoutes(context);

  const recordedIndex = getRecordedRouteHandlerIndex(context);
  const recorded = recordedIndex === undefined ? undefined : routes[recordedIndex];
  if (recorded) {
    return recorded.path;
  }

  // No recorded index on Hono 4.0 to 4.7 with the manual setup. There, `routeIndex` stays on the
  // handler that responded.
  const current = routes[context.req.routeIndex];
  if (current && isRouteHandler(current.handler)) {
    return current.path;
  }

  // No route handler started (a middleware short-circuited, or a 404): fall back to the last matched handler.
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
