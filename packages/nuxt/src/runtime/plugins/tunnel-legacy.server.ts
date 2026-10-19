import { getClient, handleTunnelRequestIfMatched, isTunnelRequest, setManagedTunnelBasePath } from '@sentry/core';
import { eventHandler, toWebRequest } from 'h3';
import type { NitroAppPlugin } from 'nitropack';
import { useRuntimeConfig } from 'nitropack/runtime';

/**
 * Answers managed tunnel requests on Nuxt v3 and v4 (Nitro v2), from the first layer of the h3 app. That runs
 * before route rules and the app's `server/middleware`.
 */
export default (nitroApp => {
  // The first layer sees the path before Nitro strips `app.baseURL`, so the tunnel is served under it.
  // `useRuntimeConfig` also picks up a `NUXT_APP_BASE_URL` set at runtime, the same value the browser gets.
  const applyBaseURL = (): void => setManagedTunnelBasePath(getClient(), useRuntimeConfig().app?.baseURL);
  applyBaseURL();

  // Not the `request` hook: h3 still runs the first layer after a hook answered, and with a `headers` route rule
  // that layer throws for writing headers on the sent response.
  nitroApp.h3App.stack.unshift({
    route: '',
    handler: eventHandler(event => {
      // `init` may run after this plugin, so this also covers the first requests after it.
      applyBaseURL();

      // Checked on the method and path first, so no other request's body gets wrapped in a web `Request`.
      if (!isTunnelRequest({ method: event.method, url: event.path })) {
        return undefined;
      }

      // A returned `Response` is sent and ends the request, while `undefined` hands it to the next layer.
      return handleTunnelRequestIfMatched(toWebRequest(event));
    }),
  });
}) satisfies NitroAppPlugin;
