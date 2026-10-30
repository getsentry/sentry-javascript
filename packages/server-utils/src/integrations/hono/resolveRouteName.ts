import type { Context, HonoRoute } from './honoTypes';
import { SENTRY_HONO_MIDDLEWARE } from './constants';
import { getRecordedRouteHandlerIndex } from './matchResult';

/**
 * Returns the path of the route that handles the request, or `undefined` if the request has no route.
 * Not the last matched route: a catch-all registered later also matches.
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

  // Hono runs the first matched route handler first. If a middleware returned early, it is the one that
  // would have run.
  const firstRouteHandler = routes.find((_route, i) => !middlewareFlags[i]);
  if (firstRouteHandler) {
    return firstRouteHandler.path;
  }

  // Only middleware matched, for example `app.use('/static/*', serveStatic())`. The Sentry middleware
  // and `/*` middleware say nothing about the route.
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
