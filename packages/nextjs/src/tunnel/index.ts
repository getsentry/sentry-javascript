import { handleTunnelRequest } from '@sentry/core';

export interface CreateSentryTunnelRouteOptions {
  /**
   * DSNs whose envelopes the route forwards, in addition to the DSN of the server SDK. It rejects envelopes for other
   * DSNs with a 403. Defaults to the DSNs `serveTunnelIntegration` allows.
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
  const allowedDsns = options.allowedDsns?.length ? options.allowedDsns.map(dsn => dsn.trim()) : undefined;

  return {
    POST: request => handleTunnelRequest(request, { allowedDsns }),
  };
}

/**
 * Route handler for the `tunnelRoute` of `withSentryConfig`. It forwards Sentry envelopes to Sentry, but not the
 * request headers (such as cookies).
 *
 * It accepts envelopes for the DSN of the server SDK, and the DSNs `serveTunnelIntegration` allows. For other DSNs,
 * use `createSentryTunnelRoute`.
 *
 * @example
 * ```ts
 * // app/sentry-tunnel/route.ts
 * export { POST } from '@sentry/nextjs/tunnel';
 * ```
 */
export const POST: TunnelRouteHandler = createSentryTunnelRoute().POST;
