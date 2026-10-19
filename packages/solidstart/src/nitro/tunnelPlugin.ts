import {
  getClient,
  GLOBAL_OBJ,
  handleTunnelRequestIfMatched,
  isTunnelRequest,
  setManagedTunnelBasePath,
} from '@sentry/core';
import { eventHandler, toWebRequest } from 'h3';
import type { NitroAppPlugin } from 'nitropack';
import { TUNNEL_BASE_PATH_GLOBAL } from '../common/tunnel';

/**
 * Answers managed tunnel requests on SolidStart v1 (Nitro v2), from the first layer of the h3 app. That runs before
 * route rules, the app's middleware and routing. `withSentry` registers it.
 */
export default (nitroApp => {
  // The first layer sees the path before Nitro strips `server.baseURL`, so the tunnel is served under it. `init` may run
  // after this plugin, so this is repeated for the first requests after it too.
  const applyBaseURL = (): void =>
    setManagedTunnelBasePath(
      getClient(),
      (GLOBAL_OBJ as { [TUNNEL_BASE_PATH_GLOBAL]?: string })[TUNNEL_BASE_PATH_GLOBAL],
    );
  applyBaseURL();

  // Not the `request` hook: h3 still runs the first layer after a hook answered, so route rules would act on the
  // sent response.
  nitroApp.h3App.stack.unshift({
    route: '',
    handler: eventHandler(event => {
      applyBaseURL();

      // Checked on the method and path first, so no other request's body gets wrapped in a web `Request`.
      if (!isTunnelRequest({ method: event.method, url: event.path })) {
        return undefined;
      }

      // `toWebRequest` also reads the body of the mock requests serverless presets pass through `localFetch`, which
      // aren't Node streams. A returned `Response` is sent and ends the request, `undefined` hands it on.
      return handleTunnelRequestIfMatched(toWebRequest(event));
    }),
  });
}) satisfies NitroAppPlugin;
