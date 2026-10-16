import type { TunnelRequestLike } from '@sentry/core';
import { getClient, isTunnelRequest as isManagedTunnelRequest } from '@sentry/core';
import { getInjectedManagedTunnelOptions } from './managedTunnelRoute';

/**
 * Returns true if the request targets the tunnel `tunnelRoute` serves, so middleware that blocks unauthenticated
 * requests can let it through:
 *
 * ```ts
 * if (Sentry.isTunnelRequest(request)) {
 *   return NextResponse.next();
 * }
 * ```
 */
export function isTunnelRequest(request: TunnelRequestLike): boolean {
  // On OpenNext the client is set up before the injected options are, so they are read here as well.
  const tunnelOptions = getClient()?.getOptions()._managedTunnel ?? getInjectedManagedTunnelOptions();

  return !!tunnelOptions && isManagedTunnelRequest(request, tunnelOptions);
}
