import {
  _INTERNAL_handleServedTunnelRequest as handleServedTunnelRequest,
  _INTERNAL_setManagedTunnelDefaults as setManagedTunnelDefaults,
} from '@sentry/core/server';
import { useRuntimeConfig } from 'nitro/runtime-config';
import type { NitroAppPlugin, NitroApp } from 'nitro/types';

/**
 * Answers managed tunnel requests on Nuxt v5+ (Nitro v3+).
 */
export default ((nitroApp: NitroApp) => {
  // Nitro runs the app's `server/middleware` before anything a module registers, so an auth middleware there would
  // block the tunnel. Every preset hands requests to `nitroApp.fetch` after the plugins ran, so wrapping it goes
  // first, before route rules and middleware.
  // Requests still carry Nuxt's `app.baseURL` here, so the tunnel is served under it. `useRuntimeConfig` also picks
  // up a `NUXT_APP_BASE_URL` set at runtime.
  setManagedTunnelDefaults({ basePath: (useRuntimeConfig() as { app?: { baseURL?: string } }).app?.baseURL });
  const appFetch = nitroApp.fetch;
  nitroApp.fetch = request => handleServedTunnelRequest(request) ?? appFetch(request);
}) satisfies NitroAppPlugin;
