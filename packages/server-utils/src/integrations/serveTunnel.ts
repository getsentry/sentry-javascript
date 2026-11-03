import type { ServerTunnelOptions } from '@sentry/core';
import { defineIntegration } from '@sentry/core';
import { HTTP_ON_SERVER_REQUEST, serveTunnelIntegration as coreServeTunnelIntegration } from '@sentry/core/server';
import { subscribe } from '../utils/diagnosticsChannel';
import { instrumentTunnelServer } from '../utils/tunnelServer';

let isSubscribed = false;

/**
 * Lets every `node:http` server answer managed tunnel requests before the app sees them, whatever framework runs on
 * it. Nothing is answered unless the tunnel is on, through `serveTunnelIntegration` or a framework SDK.
 */
export function instrumentTunnelServers(): void {
  if (isSubscribed) {
    return;
  }

  isSubscribed = true;
  subscribe(HTTP_ON_SERVER_REQUEST, instrumentTunnelServer);
}

/**
 * Makes a `serveTunnelIntegration` that, unless `intercept` is off, also runs `instrumentRuntimeServers` to answer
 * tunnel requests on the runtime's own servers, like `Bun.serve` or `Deno.serve`.
 */
export function makeServeTunnelIntegration(instrumentRuntimeServers?: () => void) {
  return defineIntegration((options: ServerTunnelOptions = {}) => {
    return {
      ...coreServeTunnelIntegration(options),
      setupOnce() {
        if (options.intercept !== false) {
          instrumentTunnelServers();
          instrumentRuntimeServers?.();
        }
      },
    };
  });
}

/**
 * Lets your server forward the events of a browser SDK set up with `tunnel: true` to Sentry.
 *
 * With this integration on the server and `tunnel: true` in the browser `init`, the browser sends its events to your
 * own server instead of Sentry, where ad-blockers can't drop them, and your server forwards them to Sentry.
 *
 * Every `node:http` server answers the tunnel requests before the app sees them. To serve them from your own code
 * instead, set `intercept: false` and call `handleTunnelRequestIfMatched`.
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
export const serveTunnelIntegration = makeServeTunnelIntegration();
