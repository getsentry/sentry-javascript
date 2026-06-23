import type { Context } from 'hono';
import { matchedRoutes, routePath } from 'hono/route';
import { isMiddleware } from '../utils/isMiddleware';

// Arity alone is enough here (unlike `wrapSubAppMiddleware` in patchRoute.ts, which also needs position)
// We only want the path, and inline middleware shares its handler's path.
function isRouteHandler(handler: unknown): boolean {
  return typeof handler === 'function' && !isMiddleware(handler);
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
