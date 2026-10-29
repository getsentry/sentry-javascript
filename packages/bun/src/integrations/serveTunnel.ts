import * as http from 'node:http';
import * as https from 'node:https';
import type { IntegrationFn, ServerTunnelOptions } from '@sentry/core';
import { _INTERNAL_normalizeTunnelBasePath, debug, defineIntegration, getClient } from '@sentry/core';
import {
  _INTERNAL_getTunnelPaths as getTunnelPaths,
  _INTERNAL_handleServedTunnelRequest as handleServedTunnelRequest,
  _INTERNAL_instrumentTunnelServer as instrumentTunnelServer,
  serveTunnelIntegration as coreServeTunnelIntegration,
} from '@sentry/core/server';
import type { Server } from 'bun';

type BunServeOptions = Parameters<typeof Bun.serve>[0] & { routes?: Record<string, unknown> };
type BunHandler = (request: Request, server: Server) => Response | Promise<Response>;

let hasPatchedBunServe = false;
let hasPatchedHttpServer = false;

const _serveTunnelIntegration = ((options: ServerTunnelOptions = {}) => {
  const integration = coreServeTunnelIntegration(options);

  return {
    ...integration,
    setupOnce() {
      if (options.intercept === false) {
        return;
      }

      patchBunServe();
      patchHttpServer();
    },
  };
}) satisfies IntegrationFn;

/**
 * Lets your server forward the events of a browser SDK set up with `tunnel: true` to Sentry.
 *
 * With this integration on the server and `tunnel: true` in the browser `init`, the browser sends its events to your
 * own server instead of Sentry, where ad-blockers can't drop them, and your server forwards them to Sentry.
 *
 * `Bun.serve` (including a default-exported server) and `node:http` servers answer the tunnel requests before the app
 * sees them. To serve them from your own code instead, set `intercept: false` and call `handleTunnelRequestIfMatched`.
 *
 * By default only envelopes for the server's own DSN are forwarded.
 *
 * @example
 * ```js
 * // Server
 * Sentry.init({
 *   dsn: '__DSN__',
 *   integrations: [Sentry.serveTunnelIntegration()],
 * });
 *
 * // Browser
 * Sentry.init({
 *   dsn: '__DSN__',
 *   tunnel: true,
 * });
 * ```
 */
export const serveTunnelIntegration = defineIntegration(_serveTunnelIntegration);

/**
 * Answers tunnel requests ahead of every `Bun.serve` app, including after `server.reload`. Bun starts a
 * default-exported server through the same global, so it's covered too.
 */
function patchBunServe(): void {
  if (hasPatchedBunServe) {
    return;
  }

  try {
    const originalServe = Bun.serve;
    Bun.serve = function (this: unknown, serveOptions: BunServeOptions) {
      const server = originalServe.call(this, withTunnel(serveOptions)) as Server;
      try {
        const originalReload = server.reload.bind(server);
        server.reload = (reloadOptions: BunServeOptions) => originalReload(withTunnel(reloadOptions));
      } catch (error) {
        debug.warn('Sentry tunnel: could not wrap server.reload', error);
      }

      return server;
    };
    hasPatchedBunServe = true;
  } catch (error) {
    debug.warn('Sentry tunnel: could not patch Bun.serve', error);
  }
}

/**
 * Adds a `POST` route per tunnel path and answers tunnel requests ahead of `fetch`. Leaves the options as they were if
 * anything goes wrong, so the server still starts.
 *
 * Routes, not only `fetch`: Bun answers a POST under a `'/*'` HTML import or static `Response` without running any
 * JavaScript, so only an exact route reaches the tunnel there. A `POST`-only route leaves every other method to the
 * app's routes.
 */
function withTunnel(serveOptions: BunServeOptions): BunServeOptions {
  try {
    if (!serveOptions || typeof serveOptions !== 'object') {
      return serveOptions;
    }

    const userFetch = serveOptions.fetch as BunHandler | undefined;
    if (typeof userFetch === 'function') {
      serveOptions.fetch = function (this: Server, request: Request, server: Server) {
        return handleServedTunnelRequest(request) ?? userFetch.call(this, request, server);
      } as typeof serveOptions.fetch;
    }

    const tunnelPaths = getTunnelRoutePaths();
    if (tunnelPaths.length) {
      const routes: Record<string, unknown> = { ...serveOptions.routes };
      for (const path of tunnelPaths) {
        routes[path] = makeTunnelRoute(routes[path], serveOptions);
      }
      serveOptions.routes = routes as BunServeOptions['routes'];
    }
  } catch (error) {
    debug.warn('Sentry tunnel: could not add the tunnel to Bun.serve', error);
  }

  return serveOptions;
}

/**
 * The full tunnel paths, with and without a trailing slash, since Bun routes match exactly.
 */
function getTunnelRoutePaths(): string[] {
  const basePath = _INTERNAL_normalizeTunnelBasePath(getClient()?.getOptions()._managedTunnel?.basePath);

  return getTunnelPaths().flatMap(path => [`${basePath}${path}`, `${basePath}${path}/`]);
}

/**
 * Our `POST` handler, merged with whatever the app has on the same path. An app route that is neither a handler nor
 * a handler per method (a static `Response` or an HTML import) is left as it is.
 */
function makeTunnelRoute(existing: unknown, serveOptions: BunServeOptions): unknown {
  if (typeof existing === 'function') {
    const appRoute = existing as BunHandler;

    return (request: Request, server: Server) =>
      (request.method === 'POST' && handleServedTunnelRequest(request)) || appRoute(request, server);
  }

  if (existing !== undefined && Object.getPrototypeOf(existing) !== Object.prototype) {
    return existing;
  }

  const methods = (existing ?? {}) as Record<string, unknown>;
  const appPost = methods.POST;

  return {
    ...methods,
    POST: (request: Request, server: Server) =>
      handleServedTunnelRequest(request) ?? toApp(request, server, appPost, serveOptions),
  };
}

/**
 * Where a POST on a tunnel path goes when the tunnel doesn't answer it. Bun can't hand a request back to its router,
 * so the app's route on the same path, else `fetch`, else a 404.
 */
function toApp(
  request: Request,
  server: Server,
  appPost: unknown,
  serveOptions: BunServeOptions,
): Response | Promise<Response> {
  if (appPost instanceof Response) {
    return appPost.clone();
  }

  if (typeof appPost === 'function') {
    return (appPost as BunHandler)(request, server);
  }

  if (typeof serveOptions.fetch === 'function') {
    return (serveOptions.fetch as BunHandler).call(server, request, server);
  }

  return new Response('Not Found', { status: 404 });
}

/**
 * Bun publishes no `http.server.request.start` channel, so the first request of each `node:http` server hands it to
 * the same `emit` wrapper Node uses, then goes through it.
 */
function patchHttpServer(): void {
  if (hasPatchedHttpServer) {
    return;
  }

  hasPatchedHttpServer = true;
  const instrumented = new WeakSet<object>();
  // In Bun `https.Server` reuses `http.Server`.
  for (const ServerClass of new Set([http.Server, https.Server])) {
    try {
      // oxlint-disable-next-line typescript/unbound-method -- called with the server as `this` below
      const originalEmit = ServerClass.prototype.emit;
      ServerClass.prototype.emit = function (this: http.Server, event: string, ...args: unknown[]): boolean {
        if (event === 'request' && !instrumented.has(this)) {
          instrumented.add(this);
          instrumentTunnelServer({ server: this });

          return this.emit(event, ...args);
        }

        return originalEmit.call(this, event, ...args) as boolean;
      } as typeof originalEmit;
    } catch (error) {
      debug.warn('Sentry tunnel: could not patch the node:http server', error);
    }
  }
}
