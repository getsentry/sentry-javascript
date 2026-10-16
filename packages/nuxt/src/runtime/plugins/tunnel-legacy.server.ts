import { getClient, handleTunnelRequestIfMatched, isTunnelRequest, setManagedTunnelBasePath } from '@sentry/core';
import { sendWebResponse, toWebRequest } from 'h3';
import type { NitroAppPlugin } from 'nitropack';
import { useRuntimeConfig } from 'nitropack/runtime';

/**
 * Answers managed tunnel requests on Nuxt v3 and v4 (Nitro v2). The `request` hook runs before route rules and
 * the app's `server/middleware`.
 */
export default (nitroApp => {
  // The `request` hook sees the path before Nitro strips `app.baseURL`, so the tunnel is served under it.
  // `useRuntimeConfig` also picks up a `NUXT_APP_BASE_URL` set at runtime, the same value the browser gets.
  const applyBaseURL = (): void => setManagedTunnelBasePath(getClient(), useRuntimeConfig().app?.baseURL);
  applyBaseURL();

  nitroApp.hooks.hook('request', async event => {
    // `init` may run after this plugin, so this also covers the first requests after it.
    applyBaseURL();

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
