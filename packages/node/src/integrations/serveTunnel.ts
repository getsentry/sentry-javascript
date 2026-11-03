import { _INTERNAL_instrumentTunnelServers as instrumentTunnelServers } from '@sentry/server-utils';

export { serveTunnelIntegration } from '@sentry/server-utils';

/**
 * Lets every `node:http` server answer managed tunnel requests before the app sees them. Nothing is answered until
 * the tunnel is on. For framework SDKs that enable the tunnel after `init`, like TanStack Start's `tunnelRoute`.
 */
export function installTunnelHooks(): void {
  instrumentTunnelServers();
}
