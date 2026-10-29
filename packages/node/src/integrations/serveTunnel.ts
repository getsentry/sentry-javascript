import { defineIntegration } from '@sentry/core';
import type { IntegrationFn, ServerTunnelOptions } from '@sentry/core';
import {
  _INTERNAL_instrumentTunnelServer as instrumentTunnelServer,
  HTTP_ON_SERVER_REQUEST,
  serveTunnelIntegration as coreServeTunnelIntegration,
} from '@sentry/core/server';
import { subscribeDiagnosticsChannel } from '@sentry/server-utils';

const _serveTunnelIntegration = ((options: ServerTunnelOptions = {}) => {
  const integration = coreServeTunnelIntegration(options);

  return {
    ...integration,
    setupOnce() {
      if (options.intercept !== false) {
        subscribeDiagnosticsChannel(HTTP_ON_SERVER_REQUEST, instrumentTunnelServer);
      }
    },
  };
}) satisfies IntegrationFn;

/**
 * Lets your server forward the events of a browser SDK set up with `tunnel: true` to Sentry.
 *
 * With this integration on the server and `tunnel: true` in the browser `init`, the browser sends its events to your
 * own server instead of Sentry, where ad-blockers can't drop them, and your server forwards them to Sentry.
 *
 * Every `node:http` server answers the tunnel requests before the app sees them, whatever framework runs on it. To
 * serve them from your own code instead, set `intercept: false` and call `handleTunnelRequestIfMatched`.
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
