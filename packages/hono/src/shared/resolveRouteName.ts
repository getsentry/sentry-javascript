import type { Context } from 'hono';
import { matchedRoutes, routePath } from 'hono/route';

// Hono stores the unwrapped handler here when it wraps a sub-app handler for a custom `onError`.
// See https://github.com/honojs/hono/blob/9f0dadf141a3242a6c3b77462c7d33c6ce0f599d/src/hono-base.ts#L224-L226
const COMPOSED_HANDLER = '__COMPOSED_HANDLER';

// Hono doesn't flag middleware, so we infer it from arity (# of params): middleware is `(context, next)`, handlers are `(context)`.
function isRouteHandler(handler: unknown): boolean {
  if (typeof handler !== 'function') {
    return false;
  }

  // Unwrap onError-wrapped handlers so we check the original handler's arity, not the wrapper's
  const composed = (handler as unknown as Record<string, unknown>)[COMPOSED_HANDLER];
  const original = typeof composed === 'function' ? composed : handler;

  return (original as (...args: unknown[]) => unknown).length < 2;
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
