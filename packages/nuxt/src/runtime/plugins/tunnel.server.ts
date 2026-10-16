import { getClient, handleTunnelRequestIfMatched, setManagedTunnelBasePath } from '@sentry/core';
import { useRuntimeConfig } from 'nitro/runtime-config';
import type { NitroAppPlugin, NitroApp } from 'nitro/types';

/**
 * Answers managed tunnel requests on Nuxt v5+ (Nitro v3+).
 */
export default ((nitroApp: NitroApp) => {
  // Nitro runs the app's `server/middleware` before anything a module registers, so an auth middleware there would
  // block the tunnel. Nitro has no public way to go first, but its own generated code wires middleware through
  // this same array.
  // Requests still carry Nuxt's `app.baseURL` here, so the tunnel is served under it.
  const applyBaseURL = (): void =>
    setManagedTunnelBasePath(getClient(), (useRuntimeConfig() as { app?: { baseURL?: string } }).app?.baseURL);
  applyBaseURL();
  nitroApp.h3?.['~middleware'].unshift((event, next) => {
    // `init` may run after this plugin, so this also covers the first requests after it.
    applyBaseURL();

    return handleTunnelRequestIfMatched(event.req) ?? next();
  });
}) satisfies NitroAppPlugin;
