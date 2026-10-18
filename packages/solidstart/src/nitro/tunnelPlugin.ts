import {
  getClient,
  GLOBAL_OBJ,
  handleTunnelRequestIfMatched,
  isTunnelRequest,
  setManagedTunnelBasePath,
} from '@sentry/core';
import { sendWebResponse, toWebRequest } from 'h3';
import type { NitroAppPlugin } from 'nitropack';
import { TUNNEL_BASE_PATH_GLOBAL } from '../common/tunnel';

/**
 * Answers managed tunnel requests on SolidStart v1 (Nitro v2). The `request` hook runs before the app's middleware
 * and routing. `withSentry` registers it.
 */
export default (nitroApp => {
  // The hook sees the path before Nitro strips `server.baseURL`, so the tunnel is served under it. `init` may run
  // after this plugin, so this is repeated for the first requests after it too.
  const applyBaseURL = (): void =>
    setManagedTunnelBasePath(
      getClient(),
      (GLOBAL_OBJ as { [TUNNEL_BASE_PATH_GLOBAL]?: string })[TUNNEL_BASE_PATH_GLOBAL],
    );
  applyBaseURL();

  nitroApp.hooks.hook('request', async event => {
    applyBaseURL();

    // Checked on the method and path first, so no other request's body gets wrapped in a web `Request`.
    if (!isTunnelRequest({ method: event.method, url: event.path })) {
      return;
    }

    // `toWebRequest` also reads the body of the mock requests serverless presets pass through `localFetch`, which
    // aren't Node streams.
    const tunnelResponse = handleTunnelRequestIfMatched(toWebRequest(event));
    if (tunnelResponse) {
      // Sending the response marks the event as handled, so Nitro stops here.
      await sendWebResponse(event, await tunnelResponse);
    }
  });
}) satisfies NitroAppPlugin;
