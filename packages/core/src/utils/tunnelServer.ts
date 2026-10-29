import { DEBUG_BUILD } from '../debug-build';
import type { HttpServer } from '../integrations/http/types';
import { debug } from './debug-logger';
import { handleServedNodeTunnelRequest } from './tunnelForward';

const tunnelServers = new WeakSet<HttpServer>();

/**
 * Wraps a Node server's `emit` once, so requests to the tunnel `serveTunnelIntegration` serves are answered before
 * any of the app's `request` listeners run. A listener for the `http.server.request.start` diagnostics channel, which
 * Node publishes right before it emits each request, so even the first request is answered.
 *
 * It never throws, since Node rethrows a channel listener's error as an uncaught exception.
 */
export function instrumentTunnelServer(message: unknown): void {
  try {
    const server = (message as { server?: HttpServer } | undefined)?.server;
    if (!server || tunnelServers.has(server)) {
      return;
    }

    tunnelServers.add(server);
    // oxlint-disable-next-line typescript/unbound-method -- called with the server as `this` below
    const originalEmit = server.emit;
    server.emit = function (this: HttpServer, event: string, ...data: unknown[]) {
      const [request, response] = data as Parameters<typeof handleServedNodeTunnelRequest>;
      if (event === 'request' && handleServedNodeTunnelRequest(request, response)) {
        return true;
      }

      return originalEmit.call(this, event, ...data);
    } as HttpServer['emit'];
  } catch (error) {
    DEBUG_BUILD && debug.error('Sentry tunnel: failed to instrument a server', error);
  }
}
