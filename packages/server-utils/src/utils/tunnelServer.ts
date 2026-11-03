import { debug } from '@sentry/core';
import { _INTERNAL_handleServedNodeTunnelRequest as handleServedNodeTunnelRequest } from '@sentry/core/server';
import { DEBUG_BUILD } from '../debug-build';

type TunnelServer = { emit(event: string, ...data: unknown[]): boolean };

const tunnelServers = new WeakSet<TunnelServer>();

/**
 * Wraps a Node server's `emit` once, so requests to the tunnel `serveTunnelIntegration` serves are answered before
 * any of the app's `request` listeners run. A listener for the `http.server.request.start` diagnostics channel, which
 * Node publishes right before it emits each request, so even the first request is answered.
 *
 * It never throws, since Node rethrows a channel listener's error as an uncaught exception.
 */
export function instrumentTunnelServer(message: unknown): void {
  try {
    const server = (message as { server?: TunnelServer } | undefined)?.server;
    if (!server || tunnelServers.has(server)) {
      return;
    }

    tunnelServers.add(server);
    // oxlint-disable-next-line typescript/unbound-method -- called with the server as `this` below
    const originalEmit = server.emit;
    server.emit = function (this: TunnelServer, event: string, ...data: unknown[]) {
      const [request, response] = data as Parameters<typeof handleServedNodeTunnelRequest>;
      if (event === 'request' && handleServedNodeTunnelRequest(request, response)) {
        return true;
      }

      return originalEmit.call(this, event, ...data);
    };
  } catch (error) {
    DEBUG_BUILD && debug.error('Sentry tunnel: failed to instrument a server', error);
  }
}
