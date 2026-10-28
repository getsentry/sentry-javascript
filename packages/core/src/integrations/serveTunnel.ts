import { defineIntegration } from '../integration';
import type { IntegrationFn } from '../types/integration';
import type { ServerTunnelOptions } from '../types/options';
import { enableManagedTunnel } from '../utils/managedTunnelDefaults';
import { SERVE_TUNNEL_INTEGRATION_NAME } from '../utils/tunnel';
import { forwardTunnelRequest } from '../utils/tunnelForward';

const _serveTunnelIntegration = ((options: ServerTunnelOptions = {}) => {
  return {
    name: SERVE_TUNNEL_INTEGRATION_NAME,
    forward: forwardTunnelRequest,
    setup(client) {
      enableManagedTunnel(client, options, forwardTunnelRequest);
    },
  };
}) satisfies IntegrationFn;

/**
 * Serves the managed tunnel, so a browser `init` with `tunnel: true` sends its envelopes through the app's own origin
 * instead of the Sentry ingest URL, where ad-blockers can't drop them. The meta-framework SDKs answer the tunnel
 * requests from their request hooks.
 *
 * By default the tunnel path is derived from the DSN, under the app's base path, and only envelopes for the server's
 * own DSN are forwarded. A `path` is served as written.
 *
 * @example
 * ```js
 * Sentry.init({
 *   dsn: '__DSN__',
 *   integrations: [Sentry.serveTunnelIntegration()],
 * });
 * ```
 */
export const serveTunnelIntegration = defineIntegration(_serveTunnelIntegration);
