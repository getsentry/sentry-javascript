import type { RouteProvider } from '@sentry/browser';
import { createUrlRouteProvider } from '@sentry/browser';
import type { Route } from './router';
import type { Vue } from './types';

// Vue Router 3 resolves to `{ route }`, Vue Router 4+ returns the route itself.
type ResolvedLocation = Route | { route: Route };

type RouteUrl = Parameters<RouteProvider['resolveRoute']>[0];

interface InstalledRouter {
  resolve?: (to: string) => ResolvedLocation;
  /** Vue Router 4+ */
  options?: { history?: { base?: string } };
  /** Vue Router 3 */
  mode?: string;
  history?: { base?: string };
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
    const router = getRouter();
    const resolved = router?.resolve?.(getRouterLocation(router, url));
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
export function getRouterFromApp(app: Vue | Vue[] | undefined): InstalledRouter | undefined {
  const firstApp = (Array.isArray(app) ? app[0] : app) as AppWithRouter | undefined;

  return firstApp?.config?.globalProperties?.$router;
}

/**
 * `resolve` matches the router's own location rather than the browser's: the hash in hash mode, and
 * the path without the router's base otherwise. Mirrors vue-router's `createCurrentLocation`.
 */
function getRouterLocation(router: InstalledRouter, { pathname, search, hash }: RouteUrl): string {
  const base = router.options?.history?.base ?? router.history?.base ?? '';
  const hashPos = base.indexOf('#');

  if (hashPos > -1 || router.mode === 'hash') {
    const hashBase = hashPos > -1 ? base.slice(hashPos) : '#';
    const path = hash.slice(hash.startsWith(hashBase) ? hashBase.length : 1);

    return path.startsWith('/') ? path : `/${path}`;
  }

  const path =
    base && pathname.toLowerCase().startsWith(base.toLowerCase()) ? pathname.slice(base.length) || '/' : pathname;

  return `${path}${search}${hash}`;
}
