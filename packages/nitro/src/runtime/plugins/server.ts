import { getClient, handleTunnelRequestIfMatched, setManagedTunnelBasePath } from '@sentry/core';
import { definePlugin } from 'nitro';
import { useRuntimeConfig } from 'nitro/runtime-config';
import { captureErrorHook } from '../hooks/captureErrorHook';

export default definePlugin(nitroApp => {
  nitroApp.hooks.hook('error', captureErrorHook);

  // Nitro runs the app's `middleware/` before anything a module registers, so an auth middleware there would block
  // the tunnel. Every preset hands requests to `nitroApp.fetch` after the plugins ran, so wrapping it goes first,
  // before route rules and middleware. Requests still carry Nitro's `baseURL` here, so the tunnel is served under it.
  const applyBaseURL = (): void =>
    setManagedTunnelBasePath(getClient(), (useRuntimeConfig() as { app?: { baseURL?: string } }).app?.baseURL);
  applyBaseURL();
  const appFetch = nitroApp.fetch;
  nitroApp.fetch = request => {
    // `init` may run after this plugin, so this also covers the first requests after it.
    applyBaseURL();

    return handleTunnelRequestIfMatched(request) ?? appFetch(request);
  };
});
