import type { TunnelOptions } from '@sentry/core';
import { getClient, handleTunnelRequest } from '@sentry/core';
import { isTunnelRequest } from '@sentry/core/server';
import { getInjectedManagedTunnelOptions, MANAGED_TUNNEL_PATH_PARAM, MANAGED_TUNNEL_ROUTE } from './managedTunnelRoute';

/**
 * Answers managed tunnel requests in `app/sentry-tunnel/route.ts`:
 *
 * ```ts
 * export { POST } from '@sentry/nextjs/tunnel';
 * ```
 */
export function sentryTunnelRouteHandler(request: Request): Promise<Response> {
  // On OpenNext the client is set up before the injected options are, so they are read here as well.
  const tunnelOptions: TunnelOptions | undefined =
    getClient()?.getOptions()._managedTunnel ?? getInjectedManagedTunnelOptions();
  const basePath = tunnelOptions?.basePath?.replace(/\/$/, '') ?? '';
  const url = new URL(request.url);

  // The rewrite matches any envelope POST with a single path segment, so the path must still match the DSN.
  const requestedPath =
    url.pathname === `${basePath}${MANAGED_TUNNEL_ROUTE}`
      ? `${basePath}/${url.searchParams.get(MANAGED_TUNNEL_PATH_PARAM) ?? ''}`
      : url.pathname;

  if (!tunnelOptions || !isTunnelRequest({ method: request.method, url: requestedPath }, tunnelOptions)) {
    return Promise.resolve(new Response(null, { status: 404 }));
  }

  return handleTunnelRequest({ request, allowedDsns: tunnelOptions.allowedDsns });
}
