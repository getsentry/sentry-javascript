import { GLOBAL_OBJ } from '@sentry/core';
import {
  _INTERNAL_handleServedTunnelRequest as handleServedTunnelRequest,
  _INTERNAL_isServedTunnelRequest as isServedTunnelRequest,
  _INTERNAL_setManagedTunnelDefaults as setManagedTunnelDefaults,
} from '@sentry/core/server';
import { eventHandler, toWebRequest } from 'h3';
import type { NitroAppPlugin } from 'nitropack';
import { TUNNEL_BASE_PATH_GLOBAL } from '../common/tunnel';

/**
 * Answers managed tunnel requests on SolidStart v1 (Nitro v2), from the first layer of the h3 app. That runs before
 * route rules, the app's middleware and routing. `withSentry` registers it.
 */
export default (nitroApp => {
  // The first layer sees the path before Nitro strips `server.baseURL`, so the tunnel is served under it. The server
  // bundle's banner sets the global before this plugin runs.
  setManagedTunnelDefaults({
    basePath: (GLOBAL_OBJ as { [TUNNEL_BASE_PATH_GLOBAL]?: string })[TUNNEL_BASE_PATH_GLOBAL],
  });

  // Not the `request` hook: h3 still runs the first layer after a hook answered, so route rules would act on the
  // sent response.
  nitroApp.h3App.stack.unshift({
    route: '',
    handler: eventHandler(event => {
      // Checked on the method and path first, so no other request's body gets wrapped in a web `Request`.
      if (!isServedTunnelRequest({ method: event.method, url: event.path })) {
        return undefined;
      }

      // `toWebRequest` also reads the body of the mock requests serverless presets pass through `localFetch`, which
      // aren't Node streams. A returned `Response` is sent and ends the request, `undefined` hands it on.
      return handleServedTunnelRequest(toWebRequest(event));
    }),
  });
}) satisfies NitroAppPlugin;
