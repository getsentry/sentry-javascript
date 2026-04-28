import { dsnToString, getClient, handleTunnelRequest } from '@sentry/core';

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
