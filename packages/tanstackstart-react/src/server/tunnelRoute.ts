import { dsnToString, escapeStringForRegex, getClient, handleTunnelRequest } from '@sentry/core';

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

        return handleTunnelRequest({
          request,
          allowedDsns,
        });
      },
    },
  };
}
