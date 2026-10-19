import type { Context, HonoRoute } from './honoTypes';
import { SENTRY_HONO_MIDDLEWARE } from './constants';
import { getRecordedRouteHandlerIndex } from './matchResult';

/**
 * Returns the route path of the handler that responded, or `undefined` if the request has no route.
 *
 * The last matched route is not enough, because a catch-all registered later would name every
 * request `/*`.
 */
export function resolveRouteName(
  context: Context,
  routes: HonoRoute[],
  middlewareFlags: boolean[],
): string | undefined {
  const recordedIndex = getRecordedRouteHandlerIndex(context);
  const recorded = recordedIndex === undefined ? undefined : routes[recordedIndex];
  if (recorded) {
    return recorded.path;
  }

  // No route handler that can pass the request on ran. Hono runs the first matched route handler, or would
  // have run it if a middleware had not returned early.
  const firstRouteHandler = routes.find((_route, i) => !middlewareFlags[i]);
  if (firstRouteHandler) {
    return firstRouteHandler.path;
  }

  // Only middleware matched, for example `app.use('/static/*', serveStatic())`. Its path is a route of
  // the app. The Sentry middleware and a middleware for every path (`/*`) say nothing about the route.
  for (let i = routes.length - 1; i >= 0; i--) {
    const route = routes[i];
    if (route && route.path !== '/*' && !isSentryMiddleware(route.handler)) {
      return route.path;
    }
  }
  return undefined;
}

function isSentryMiddleware(handler: unknown): boolean {
  return typeof handler === 'function' && Boolean(Reflect.get(handler, SENTRY_HONO_MIDDLEWARE));
}
