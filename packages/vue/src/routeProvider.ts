import type { RouteProvider } from '@sentry/core';
import { createUrlRouteProvider } from '@sentry/core';
import type { Route } from './router';

// Vue Router 3 resolves to `{ route }`, Vue Router 4+ returns the route itself.
type ResolvedLocation = Route | { route: Route };

interface InstalledRouter {
  resolve?: (to: string) => ResolvedLocation;
}

interface AppWithRouter {
  config?: { globalProperties?: { $router?: InstalledRouter } };
}

/**
 * Builds a route provider from a `vue-router` instance, however the SDK got hold of one.
 *
 * The router is looked up per call rather than captured once, because `app.use(router)` may run
 * either side of `Sentry.init()` and only the app itself is guaranteed to exist by then.
 */
export function createVueRouteProvider(getRouter: () => InstalledRouter | undefined): RouteProvider {
  return createUrlRouteProvider(url => {
    const resolved = getRouter()?.resolve?.(`${url.pathname}${url.search}${url.hash}`);
    if (!resolved) {
      return undefined;
    }

    const route = 'matched' in resolved ? resolved : resolved.route;

    // Always the matched path, never `route.name`. Callers set `url.template` from this, and a route
    // name is an identifier rather than a template.
    return route.matched[route.matched.length - 1]?.path;
  });
}

/**
 * Reads the router `vue-router` installed onto a Vue app.
 */
export function getRouterFromApp(app: unknown): InstalledRouter | undefined {
  const firstApp: AppWithRouter | undefined = Array.isArray(app) ? app[0] : (app as AppWithRouter | undefined);

  return firstApp?.config?.globalProperties?.$router;
}
