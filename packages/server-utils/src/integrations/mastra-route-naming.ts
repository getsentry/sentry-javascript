import { setHttpServerSpanRouteAttribute } from '../utils/setHttpServerSpanRouteAttribute';

// Mastra serves its API (and any custom `registerApiRoute`) on a Hono server. Sentry's HTTP server
// instrumentation names the incoming `http.server` span from the raw URL (`sentry.segment.name.source`
// = `url`), because — unlike Express/Fastify — nothing feeds it the matched route pattern. Left alone,
// `/echo/42` and `/echo/99` become distinct high-cardinality transactions.
//
// Mastra owns its Hono app internally and never exposes the instance, so `@sentry/hono` (which wraps an
// app you construct) cannot be applied to it. What Mastra *does* expose is a middleware seam
// (`server.middleware`). We inject the middleware below into the Mastra config at construction time
// (see `injectMastraRouteNamingMiddleware`), read the matched route from the Hono `Context` after the
// handler has run, and upgrade the root `http.server` span to `${method} ${route}` with
// `http.route` set and name source `route` — mirroring what the framework instrumentations do.

// Hono wraps a sub-app's handlers under this key for a custom `onError`; unwrap it so arity is read off
// the real handler, not the `(c, next)` wrapper. See `@sentry/hono`'s `isMiddleware`.
const COMPOSED_HANDLER = '__COMPOSED_HANDLER';

// The subset of Hono's `Context` we rely on. Typed structurally so `@sentry/server-utils` does not need
// a `hono` dependency (it runs inside Mastra's Hono request, so the real shape is present at runtime).
interface HonoRouteContextLike {
  req: {
    method: string;
    routeIndex: number;
    routePath: string;
    matchedRoutes: Array<{ handler: unknown; path: string }>;
  };
}

type NextFn = () => Promise<void>;
type MiddlewareHandlerLike = (context: HonoRouteContextLike, next: NextFn) => Promise<void>;

// Hono has no "is middleware" flag, so infer from arity: middleware is `(c, next)` (>= 2 args), route
// handlers are `(c)` (< 2). Mirrors `@sentry/hono`'s `isMiddleware`.
function isMiddleware(handler: unknown): boolean {
  if (typeof handler !== 'function') {
    return false;
  }
  const composed = (handler as unknown as Record<string, unknown>)[COMPOSED_HANDLER];
  const original = typeof composed === 'function' ? composed : handler;
  return (original as (...args: unknown[]) => unknown).length >= 2;
}

/**
 * Resolve the matched route pattern (e.g. `/echo/:id`) for the current request. Picks the matched
 * *handler* rather than trusting `routePath` alone, so a catch-all middleware registered after the
 * handlers, or a middleware that short-circuits before them, does not mask the real route. Mirrors
 * `@sentry/hono`'s `resolveRouteName` using only the public `Context` API.
 */
function resolveRouteName(context: HonoRouteContextLike): string | undefined {
  const routes = context.req.matchedRoutes || [];

  const current = routes[context.req.routeIndex];
  if (current && isRouteHandler(current.handler)) {
    return current.path;
  }

  for (let i = routes.length - 1; i >= 0; i--) {
    const route = routes[i];
    if (route && isRouteHandler(route.handler)) {
      return route.path;
    }
  }

  return context.req.routePath || undefined;
}

function isRouteHandler(handler: unknown): boolean {
  return typeof handler === 'function' && !isMiddleware(handler);
}

/**
 * A Hono middleware that, after the handler runs, upgrades the root `http.server` span to the matched
 * route pattern. Safe to run on every request: {@link setHttpServerSpanRouteAttribute} no-ops when
 * there is no active/root `http.server` span, and a throw here never breaks the request.
 */
export function createMastraRouteNamingMiddleware(): MiddlewareHandlerLike {
  return async function sentryMastraRouteNaming(context, next) {
    await next();
    try {
      const route = resolveRouteName(context);
      if (route) {
        setHttpServerSpanRouteAttribute(route);
      }
    } catch {
      // Never let route naming break the request.
    }
  };
}

interface MastraServerConfigLike {
  middleware?: unknown;
}

interface MastraConstructorConfigLike {
  server?: MastraServerConfigLike;
}

/**
 * Prepend the route-naming middleware to a Mastra constructor config's `server.middleware`, mutating
 * the config in place. Called from the `Mastra` constructor's orchestrion `start` channel, before
 * Mastra reads `config.server` — so no reference to the (internal) Hono app is needed. `path: '*'`
 * covers built-in API routes and custom `registerApiRoute`s alike.
 */
export function injectMastraRouteNamingMiddleware(config: unknown): void {
  if (typeof config !== 'object' || config === null) {
    return;
  }

  const typedConfig = config as MastraConstructorConfigLike;
  const server = (typedConfig.server ??= {});
  const entry = { handler: createMastraRouteNamingMiddleware(), path: '*' };

  if (Array.isArray(server.middleware)) {
    server.middleware.unshift(entry);
  } else if (server.middleware) {
    // A single middleware (function or `{ handler, path }`) — normalize to an array.
    server.middleware = [entry, server.middleware];
  } else {
    server.middleware = [entry];
  }
}
