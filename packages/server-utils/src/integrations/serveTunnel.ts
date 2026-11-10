import type { ServerTunnelOptions } from '@sentry/core';
import { defineIntegration } from '@sentry/core';
import {
  _INTERNAL_handleServedNodeTunnelRequest as handleServedNodeTunnelRequest,
  _INTERNAL_setNodeTunnelHandler as setNodeTunnelHandler,
  HTTP_ON_SERVER_REQUEST,
  serveTunnelIntegration as coreServeTunnelIntegration,
} from '@sentry/core/server';
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
  // Core's HTTP server instrumentation answers tunnel requests through it, without bundling it for apps that have no
  // tunnel.
  setNodeTunnelHandler(handleServedNodeTunnelRequest);
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
