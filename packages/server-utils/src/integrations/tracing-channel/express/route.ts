import type { ExpressLayer, ExpressRequest } from './types';

/**
 * Registered path *pattern* per routing `Layer`, captured when the layer is
 * registered via `Router.prototype.route`/`.use`. `undefined` means the layer
 * was registered without an explicit path (e.g. `app.use(mw)`), so it does not
 * contribute to the reconstructed route.
 *
 * This is the piece `req.baseUrl` can't provide: at request time `req.baseUrl`
 * holds the *resolved* mount prefix (`/api/v1`), whereas we want the registered
 * pattern (`/api/:version`).
 */
const layerRegisteredPaths = new WeakMap<ExpressLayer, string | undefined>();

/** Record the path pattern a layer was registered with. */
export function setLayerRegisteredPath(layer: ExpressLayer, path: string | undefined): void {
  layerRegisteredPaths.set(layer, path);
}

/** Read the path pattern a layer was registered with, if any. */
export function getLayerRegisteredPath(layer: ExpressLayer): string | undefined {
  return layerRegisteredPaths.get(layer);
}

/**
 * Per-request ordered stack of the registered path patterns of the layers
 * currently on the matched chain. Layers push on entry and pop when they hand
 * off via `next`, so at any point it reflects the path from the app root down
 * to the currently-executing layer. `WeakMap` so entries are released with the
 * request.
 */
const requestLayerPaths = new WeakMap<ExpressRequest, string[]>();

function getStore(req: ExpressRequest): string[] {
  let store = requestLayerPaths.get(req);
  if (!store) {
    store = [];
    requestLayerPaths.set(req, store);
  }
  return store;
}

/** Push a layer's registered path onto the request's chain. */
export function pushLayerPath(req: ExpressRequest, path: string): void {
  getStore(req).push(path);
}

/** Pop the most recently pushed layer path off the request's chain. */
export function popLayerPath(req: ExpressRequest): void {
  getStore(req).pop();
}

/**
 * The path pattern a `route`/`use` call registered, derived from its arguments.
 * A leading string/RegExp/number path becomes the pattern (arrays are joined
 * with `,`); a bare handler function yields `undefined`. Kept in sync with
 * `@sentry/core`'s Express `getLayerPath`.
 */
export function getLayerPath(args: unknown[]): string | undefined {
  const firstArg = args[0];
  if (Array.isArray(firstArg)) {
    return firstArg.map(segment => extractLayerPathSegment(segment) ?? '').join(',');
  }
  return extractLayerPathSegment(firstArg);
}

function extractLayerPathSegment(segment: unknown): string | undefined {
  return typeof segment === 'string'
    ? segment
    : segment instanceof RegExp || typeof segment === 'number'
      ? String(segment)
      : undefined;
}

/**
 * Concatenate the stored layer paths into the full route pattern (parameters
 * preserved), e.g. `/api/:version/user`. Mirrors `@sentry/core`.
 */
export function getConstructedRoute(req: ExpressRequest): string {
  const layersStore = getStore(req);

  let constructedRoute = '';
  for (const path of layersStore) {
    if (path === '/' || path === '/*') {
      continue;
    }
    constructedRoute += !constructedRoute || constructedRoute.endsWith('/') ? path : `/${path}`;
  }

  return constructedRoute.replace(/\/{2,}/g, '/');
}

/**
 * Validate the constructed route against the request URL, returning it only
 * when it plausibly corresponds to a real match (otherwise `undefined`). Mirrors
 * `@sentry/core`'s `getActualMatchedRoute` — used for the `http.route` attribute.
 */
export function getActualMatchedRoute(req: ExpressRequest, constructedRoute: string): string | undefined {
  const layersStore = getStore(req);

  if (layersStore.length === 0) {
    return undefined;
  }

  const originalUrl = typeof req.originalUrl === 'string' ? req.originalUrl : '';

  // The layer store also includes root paths in case a non-existing url was requested.
  if (layersStore.every(path => path === '/')) {
    return originalUrl === '/' ? '/' : undefined;
  }

  if (constructedRoute === '*') {
    return constructedRoute;
  }

  // For RegExp routes or route arrays, return the constructed route as-is.
  if (
    constructedRoute.includes('/') &&
    (constructedRoute.includes(',') ||
      constructedRoute.includes('\\') ||
      constructedRoute.includes('*') ||
      constructedRoute.includes('['))
  ) {
    return constructedRoute;
  }

  const normalizedRoute = constructedRoute.startsWith('/') ? constructedRoute : `/${constructedRoute}`;

  const isValidRoute =
    normalizedRoute.length > 0 &&
    (originalUrl === normalizedRoute || originalUrl.startsWith(normalizedRoute) || isRoutePattern(normalizedRoute));

  return isValidRoute ? normalizedRoute : undefined;
}

/** Whether a route contains parameter/wildcard patterns (`:id`, `*`). */
function isRoutePattern(route: string): boolean {
  return route.includes(':') || route.includes('*');
}
