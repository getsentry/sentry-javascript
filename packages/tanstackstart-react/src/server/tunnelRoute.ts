import { URL_PATH } from '@sentry/conventions/attributes';
import type { ServerTunnelOptions } from '@sentry/core';
import { dsnToString, escapeStringForRegex, getClient, handleTunnelRequest } from '@sentry/core';
import {
  _INTERNAL_forwardTunnelRequest as forwardTunnelRequest,
  _INTERNAL_handleServedTunnelRequest as handleServedTunnelRequest,
  _INTERNAL_isServedTunnelRequest as isServedTunnelRequest,
  _INTERNAL_setManagedTunnelDefaults as setManagedTunnelDefaults,
} from '@sentry/core/server';
import type { ServerEntry } from './wrapFetchWithSentry';

const registeredTunnelRoutePaths = new Set<string>();

/**
 * Drops the incoming `http.server` transaction for a tunnel route by matching its request path (the
 * `url.path` attribute, set at span creation, so it works for static and streamed lifecycles).
 * Called at server startup for the managed route and from the handler (self-registration) otherwise.
 */
export function registerSentryServerTunnelRoute(path: string): void {
  // Dedupe: the route module can be re-evaluated (HMR, multiple import paths).
  if (registeredTunnelRoutePaths.has(path)) {
    return;
  }

  const client = getClient();
  if (!client) {
    return;
  }

  registeredTunnelRoutePaths.add(path);

  const options = client.getOptions();
  options.ignoreSpans = [
    ...(options.ignoreSpans ?? []),
    { attributes: { [URL_PATH]: new RegExp(`^${escapeStringForRegex(path)}(?:[/?#]|$)`) } },
  ];
}

export interface CreateSentryTunnelRouteOptions {
  allowedDsns?: string[];
}

type SentryTunnelRouteHandlerContext = {
  request: Request;
};

type SentryTunnelRoute = {
  handlers: {
    POST: (context: SentryTunnelRouteHandlerContext) => Promise<Response>;
  };
};

/**
 * Creates a TanStack Start server route configuration for tunneling Sentry envelopes.
 *
 * @example
 * ```ts
 * import { createFileRoute } from '@tanstack/react-router';
 * import * as Sentry from '@sentry/tanstackstart-react';
 *
 * export const Route = createFileRoute('/monitoring')({
 *   server: Sentry.createSentryTunnelRoute({
 *     allowedDsns: ['https://public@o0.ingest.sentry.io/0'],
 *   }),
 * });
 * ```
 */
export function createSentryTunnelRoute(options: CreateSentryTunnelRouteOptions): SentryTunnelRoute {
  return {
    handlers: {
      POST: async ({ request }) => {
        // Self-register the path so the tunnel route's own transaction is dropped: at span-end for the
        // static path, and at span-start for subsequent streamed requests. The first streamed request
        // still leaks here (this runs after its span was sampled); managed routes avoid even that via
        // the startup registration.
        registerSentryServerTunnelRoute(new URL(request.url).pathname);

        const allowedDsnsFromOptions = options.allowedDsns?.length ? options.allowedDsns : undefined;

        const allowedDsns =
          allowedDsnsFromOptions ??
          (() => {
            const client = getClient();
            const dsn = client?.getDsn();
            return dsn ? [dsnToString(dsn)] : undefined;
          })();

        if (!allowedDsns) {
          return new Response(
            'Tunnel route requires Sentry server SDK initialized with a DSN, or pass allowedDsns explicitly.',
            { status: 500 },
          );
        }

        return handleTunnelRequest(request, { allowedDsns });
      },
    },
  };
}

/**
 * Answers managed tunnel requests before the server entry runs. The `sentryTanstackStart` Vite plugin applies this
 * to the app's server entry automatically, with its `tunnelRoute` and the base path Start routes on.
 *
 * `tunnelRoute` enables the managed tunnel on every server client the same way `serveTunnelIntegration` does, unless
 * that integration is set up too, and the tunnel is then served from the client's config like in every other SDK.
 *
 * @internal Only the code the Vite plugin generates calls this, so its parameters can change at any time.
 */
export function wrapServerEntryWithSentryTunnel<T extends ServerEntry>(
  entry: T,
  tunnelRoute?: ServerTunnelOptions,
  basePath?: string,
): T {
  // Runs when the server entry loads, before any request. Requests still carry Start's base path here, so the tunnel
  // is served under it.
  setManagedTunnelDefaults({ tunnel: tunnelRoute, forward: forwardTunnelRequest, basePath });

  // A class entry, like Cloudflare's `WorkerEntrypoint`, can't be spread into an object. The tunnel is then served
  // by the wrapped default server entry it calls.
  if (typeof entry === 'function') {
    return entry;
  }

  // Keeps the prototype, so a class instance entry keeps its other handlers, like `scheduled` or `queue`. `fetch` is
  // defined rather than assigned, which a read-only `fetch` on a frozen prototype would reject.
  return Object.create(Object.getPrototypeOf(entry), {
    ...Object.getOwnPropertyDescriptors(entry),
    fetch: {
      // Cloudflare Workers pass `env` and `ctx` after the request, and `withSentry` needs `ctx` to flush.
      value: (request: Request, ...rest: unknown[]) => {
        // Start would render the app for any other method on a tunnel path, running its root loaders.
        if (request.method !== 'POST' && isServedTunnelRequest({ method: 'POST', url: request.url })) {
          return new Response(null, { status: 405, headers: { Allow: 'POST' } });
        }

        return handleServedTunnelRequest(request) ?? entry.fetch(request, ...rest);
      },
      writable: true,
      configurable: true,
      enumerable: true,
    },
  }) as T;
}
