import type { Client } from './client';
import { getClient } from './currentScopes';
import { DEBUG_BUILD } from './debug-build';
import { getLocationHref } from './utils/browser';
import { LRUMap } from './utils/lru';
import { debug } from './utils/debug-logger';

/**
 * Resolves URLs to low-cardinality route names.
 *
 * Framework SDKs register one so that everything the SDK names after a route (span names, the scope's
 * transaction name, metric and span segment attributes) gets the parameterized route instead of the raw
 * URL, without each integration having to reach into the framework's router itself.
 *
 * A provider only answers "which route is this", never what the caller does with the answer.
 */
export interface RouteProvider {
  /**
   * Resolves a URL path template for a specific URL, e.g. `/users/42` -> `/users/:id`.
   *
   * Must return a path template, never a route identifier. Routers that name routes independently of
   * their path (Vue Router's `route.name`, Ember's `posts.show`) have to return the matched path
   * instead: callers set `url.template` from this, and an identifier is not a template. An SDK that
   * wants to name its span after the identifier still can, on the span itself.
   *
   * Returns `undefined` when the URL matches no known route. Must answer for the URL it is given rather
   * than for wherever the router currently is, so that callers can resolve a URL they captured earlier
   * (a web vital reported after a soft navigation, for example).
   */
  resolveRoute(url: URL): string | undefined;

  /**
   * Resolves the route the app is currently on.
   *
   * Routers whose location lives in the address bar can delegate to `resolveRoute`, which is what
   * {@link createUrlRouteProvider} does. Routers that keep their own location (memory and hash routers)
   * have to answer from that location instead: for those, `location.href` is the unchanging shell URL
   * and would bucket every route together.
   */
  resolveCurrentRoute(): string | undefined;
}

const CLIENT_ROUTE_PROVIDERS = new WeakMap<Client, RouteProvider>();

/**
 * Registers the route provider for a client, replacing any previously registered one.
 *
 * Register during an integration's `setup` rather than `afterAllSetup`: the pageload span is named
 * while `browserTracingIntegration` sets up, so a provider registered later can only rename it after
 * the fact.
 *
 * A client holds one provider. An app running two routers (a framework migration, or a shell plus an
 * island) registers twice and the last one wins, so the first router's routes stop resolving.
 */
export function setRouteProvider(provider: RouteProvider, client: Client | undefined = getClient()): void {
  if (!client) {
    DEBUG_BUILD && debug.warn('Cannot set a route provider without a client.');
    return;
  }

  if (DEBUG_BUILD && CLIENT_ROUTE_PROVIDERS.has(client)) {
    debug.warn(
      'A route provider is already registered for this client and will be replaced. Routes only the previous provider knows about will no longer resolve.',
    );
  }

  CLIENT_ROUTE_PROVIDERS.set(client, provider);
}

/**
 * Returns the route provider registered for a client, if any.
 */
export function getRouteProvider(client: Client | undefined = getClient()): RouteProvider | undefined {
  return client && CLIENT_ROUTE_PROVIDERS.get(client);
}

/**
 * Resolves a URL to a low-cardinality route name, e.g. `/users/42` -> `/users/:id`.
 *
 * Returns `undefined` when no route provider is registered or the URL matches no route. Callers pick
 * their own fallback, because the right one differs: a span name falls back to a low-cardinality
 * constant, the scope's transaction name to the raw path.
 */
export function resolveRoute(url: string | URL, client: Client | undefined = getClient()): string | undefined {
  const provider = getRouteProvider(client);
  if (!provider) {
    return undefined;
  }

  const urlObject = typeof url === 'string' ? toURLObject(url) : url;
  if (!urlObject) {
    return undefined;
  }

  return callProvider(() => provider.resolveRoute(urlObject));
}

/**
 * Resolves the route the app is currently on.
 *
 * Returns `undefined` when no route provider is registered or the current location matches no route.
 */
export function resolveCurrentRoute(client: Client | undefined = getClient()): string | undefined {
  const provider = getRouteProvider(client);

  return provider && callProvider(() => provider.resolveCurrentRoute());
}

/**
 * Builds a {@link RouteProvider} for a router whose location is the browser's, which covers every
 * router except memory and hash routers.
 */
export function createUrlRouteProvider(resolveRouteFromUrl: (url: URL) => string | undefined): RouteProvider {
  return {
    resolveRoute: resolveRouteFromUrl,
    resolveCurrentRoute: () => {
      const urlObject = toURLObject(getLocationHref());

      return urlObject && resolveRouteFromUrl(urlObject);
    },
  };
}

/**
 * A {@link RouteProvider} that answers from routes it has been told about, rather than by matching.
 */
export interface CachedRouteProvider extends RouteProvider {
  /** Records the route name a router reported for a path. Ignores empty values. */
  record(pathname: string | undefined, routeName: string | null | undefined): void;
}

/**
 * Builds a route provider for a router with no usable matcher, which can only report the route it is
 * on as it gets there (SvelteKit's `page.route.id`, Solid Router's current matches).
 *
 * A URL the app has not visited resolves to `undefined`, which includes the first pageload until the
 * router reports. Backed by an LRU so a long-lived app visiting many URLs can't grow it without end,
 * and so routes that keep being resolved outlive ones passed through once.
 */
export function createCachedRouteProvider(maxEntries: number = 50): CachedRouteProvider {
  const routeNames = new LRUMap<string, string>(maxEntries);

  return {
    ...createUrlRouteProvider(url => routeNames.get(url.pathname)),
    record(pathname, routeName) {
      if (pathname && routeName) {
        routeNames.set(pathname, routeName);
      }
    },
  };
}

/**
 * Normalizes to a real `URL` so providers never have to parse, and relative locations (which memory
 * routers hand around) resolve against the document.
 */
function toURLObject(url: string): URL | undefined {
  try {
    return new URL(url, getLocationHref() || undefined);
  } catch {
    return undefined;
  }
}

/**
 * Route providers are framework code we don't control, so a throw must not take down whatever the SDK
 * was naming.
 */
function callProvider(resolve: () => string | undefined): string | undefined {
  try {
    return resolve() || undefined;
  } catch (error) {
    DEBUG_BUILD && debug.warn('Route provider threw while resolving a route:', error);
    return undefined;
  }
}
