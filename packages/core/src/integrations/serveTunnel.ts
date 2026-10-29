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
 * Lets your server forward the events of a browser SDK set up with `tunnel: true` to Sentry.
 *
 * With this integration on the server and `tunnel: true` in the browser `init`, the browser sends its events to your
 * own server instead of Sentry, where ad-blockers can't drop them, and your server forwards them to Sentry.
 *
 * The server SDKs answer the tunnel requests before the app sees them. To serve them from your own code instead, set
 * `intercept: false` and call `handleTunnelRequestIfMatched`.
 *
 * By default only envelopes for the server's own DSN are forwarded.
 *
 * @example
 * ```js
 * // Server
 * Sentry.init({
 *   dsn: '__DSN__',
 *   integrations: [Sentry.serveTunnelIntegration()],
 * });
 *
 * // Browser
 * Sentry.init({
 *   dsn: '__DSN__',
 *   tunnel: true,
 * });
 * ```
 */
export const serveTunnelIntegration = defineIntegration(_serveTunnelIntegration);
