import {
  dsnToString,
  escapeStringForRegex,
  getActiveSpan,
  getClient,
  getRootSpan,
  handleTunnelRequest,
} from '@sentry/core';

// Flags a tunnel-route transaction to be dropped via `ignoreSpans` (registered in `init`). Set in the
// route handler, so it only covers the static lifecycle; streamed spans need the path-based matcher
// from `registerSentryServerTunnelRoute`, which runs early enough for the sampler.
export const TUNNEL_ROUTE_DROP_TRANSACTION_ATTRIBUTE = 'sentry.tanstackstart.drop_tunnel_transaction';

const registeredTunnelRoutePaths = new Set<string>();

/**
 * Drops the incoming `http.server` transaction for a tunnel route by matching its request path (the
 * `http.target` attribute, set at span creation, so it works for static and streamed lifecycles).
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
    { attributes: { 'http.target': new RegExp(`^${escapeStringForRegex(path)}(?:[/?#]|$)`) } },
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
        const activeSpan = getActiveSpan();
        if (activeSpan) {
          getRootSpan(activeSpan).setAttribute(TUNNEL_ROUTE_DROP_TRANSACTION_ATTRIBUTE, true);
        }

        // Self-register the path so the streamed-span sampler drops subsequent requests. The first
        // streamed request still leaks (this runs after its span was sampled); for managed routes the
        // startup registration avoids even that.
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

        return handleTunnelRequest({
          request,
          allowedDsns,
        });
      },
    },
  };
}
