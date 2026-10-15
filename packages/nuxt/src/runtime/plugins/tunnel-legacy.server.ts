import { handleTunnelRequestIfMatched, isTunnelRequest } from '@sentry/core';
import { sendWebResponse, toWebRequest } from 'h3';
import type { NitroAppPlugin } from 'nitropack';

/**
 * Answers managed tunnel requests on Nuxt v3 and v4 (Nitro v2). The `request` hook runs before route rules and
 * the app's `server/middleware`.
 */
export default (nitroApp => {
  nitroApp.hooks.hook('request', async event => {
    // Checked on the method and path first, so no other request's body gets wrapped in a web `Request`.
    if (!isTunnelRequest({ method: event.method, url: event.path })) {
      return;
    }

    const tunnelResponse = handleTunnelRequestIfMatched(toWebRequest(event));
    if (tunnelResponse) {
      await sendWebResponse(event, await tunnelResponse);
    }
  });
}) satisfies NitroAppPlugin;
