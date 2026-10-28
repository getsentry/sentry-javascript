import { dsnToString, getClient, handleTunnelRequest, makeDsn, suppressTracing } from '@sentry/core';

export interface CreateSentryTunnelRouteOptions {
  /**
   * The DSNs that the route accepts. It rejects envelopes for other DSNs with a 403.
   * Defaults to the DSN of the server SDK.
   */
  allowedDsns?: string[];
}

type TunnelRouteHandler = (request: Request) => Promise<Response>;

/**
 * Creates a route handler for the `tunnelRoute`, like `POST`, but with your own DSN allowlist.
 *
 * In most cases, use `export { POST } from '@sentry/nextjs/tunnel'` instead. Use this function only if the route must
 * accept DSNs other than the one of the server SDK, for example a different browser DSN.
 *
 * @example
 * ```ts
 * // app/sentry-tunnel/route.ts
 * import { createSentryTunnelRoute } from '@sentry/nextjs/tunnel';
 *
 * export const { POST } = createSentryTunnelRoute({
 *   allowedDsns: ['https://public@o0.ingest.sentry.io/0'],
 * });
 * ```
 */
export function createSentryTunnelRoute(options: CreateSentryTunnelRouteOptions = {}): { POST: TunnelRouteHandler } {
  const allowedDsnsFromOptions = options.allowedDsns?.length ? normalizeDsns(options.allowedDsns) : undefined;

  return {
    POST: async request => {
      // Read on each request, because the client can be set up after this module loads.
      const allowedDsns = allowedDsnsFromOptions ?? getServerDsns();
      if (!allowedDsns.length) {
        return new Response(
          allowedDsnsFromOptions
            ? 'Tunnel route has no valid DSN in allowedDsns.'
            : 'Tunnel route requires Sentry server SDK initialized with a DSN, or pass allowedDsns explicitly.',
          { status: 500 },
        );
      }

      // Like the SDK transports, so that the forward creates no spans, breadcrumbs or trace headers.
      return suppressTracing(() => handleTunnelRequest(request, { allowedDsns }));
    },
  };
}

/**
 * Route handler for the `tunnelRoute` of `withSentryConfig`. It forwards Sentry envelopes to Sentry, but not the
 * request headers (such as cookies).
 *
 * It accepts envelopes only for the DSN of the server SDK. For other DSNs, use `createSentryTunnelRoute`.
 *
 * @example
 * ```ts
 * // app/sentry-tunnel/route.ts
 * export { POST } from '@sentry/nextjs/tunnel';
 * ```
 */
export const POST: TunnelRouteHandler = createSentryTunnelRoute().POST;

function getServerDsns(): string[] {
  const dsn = getClient()?.getDsn();
  return dsn ? [dsnToString(dsn)] : [];
}

// The same form as the DSN in the envelope header, because `handleTunnelRequest` compares exact strings.
function normalizeDsns(dsns: string[]): string[] {
  return dsns.flatMap(dsn => {
    const dsnComponents = makeDsn(dsn.trim());
    return dsnComponents ? [dsnToString(dsnComponents)] : [];
  });
}
