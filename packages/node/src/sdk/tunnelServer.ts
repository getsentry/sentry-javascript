import {
  _INTERNAL_instrumentTunnelServer as instrumentTunnelServer,
  HTTP_ON_SERVER_REQUEST,
} from '@sentry/core/server';
import { subscribeDiagnosticsChannel } from '@sentry/server-utils';

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
  subscribeDiagnosticsChannel(HTTP_ON_SERVER_REQUEST, instrumentTunnelServer);
}
