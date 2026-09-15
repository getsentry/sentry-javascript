import type { Context, HonoRoute } from './honoTypes';
import { isMiddleware } from './isMiddleware';

// Arity alone is enough here (unlike `wrapSubAppMiddleware` in patchRoute.ts, which also needs position)
// We only want the path, and inline middleware shares its handler's path.
function isRouteHandler(handler: unknown): boolean {
  return typeof handler === 'function' && !isMiddleware(handler);
}

// Read the request's own matched routes rather than importing the `hono/route` helpers, so the
// instrumentation needs no runtime import from `hono`. `c.req.matchedRoutes` and `c.req.routePath`
// are the (deprecated but public) getters those helpers wrap; `routePath(c, index)` is reimplemented
// here as `matchedRoutes(c).at(index)?.path` so an arbitrary index (e.g. -1) can be resolved.
function matchedRoutes(context: Context): HonoRoute[] {
  return context.req.matchedRoutes ?? [];
}

function routePath(context: Context, index?: number): string {
  const routes = matchedRoutes(context);
  return routes.at(index ?? context.req.routeIndex)?.path ?? '';
}

/**
 * Resolves the route path of the matched handler for the transaction name.
 *
 * Picking the handler (not just `routePath`) avoids two failure modes: a catch-all middleware
 * registered after the handlers (`routePath(c, -1)` would return just `/*`), and a middleware that
 * short-circuits before the handler runs (`routePath(c)` would return the middleware's path).
 */
export function resolveRouteName(context: Context): string {
  const routes = matchedRoutes(context);

  // Trust routeIndex when it lands on a handler - to disambiguate overlapping handlers.
  const current = routes[context.req.routeIndex];
  if (current && isRouteHandler(current.handler)) {
    return current.path;
  }

  // A middleware short-circuited, so routeIndex is stuck on it: fall back to the last matched handler.
  for (let i = routes.length - 1; i >= 0; i--) {
    const route = routes[i];
    if (route && isRouteHandler(route.handler)) {
      return route.path;
    }
  }

  // No handler matched (middleware-only path)
  // Final matched route: https://hono.dev/docs/helpers/route#using-with-index-parameter
  return routePath(context, -1);
}
