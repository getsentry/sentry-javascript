import {
  _INTERNAL_handleServedTunnelRequest as handleServedTunnelRequest,
  _INTERNAL_setManagedTunnelDefaults as setManagedTunnelDefaults,
} from '@sentry/core/server';
import { definePlugin } from 'nitro';
import { useRuntimeConfig } from 'nitro/runtime-config';
import { captureErrorHook } from '../hooks/captureErrorHook';

export default definePlugin(nitroApp => {
  nitroApp.hooks.hook('error', captureErrorHook);

  // Nitro runs the app's `middleware/` before anything a module registers, so an auth middleware there would block
  // the tunnel. Every preset hands requests to `nitroApp.fetch` after the plugins ran, so wrapping it goes first,
  // before route rules and middleware. Requests still carry Nitro's `baseURL` here, so the tunnel is served under it.
  setManagedTunnelDefaults({ basePath: (useRuntimeConfig() as { app?: { baseURL?: string } }).app?.baseURL });
  const appFetch = nitroApp.fetch;
  nitroApp.fetch = request => handleServedTunnelRequest(request) ?? appFetch(request);
});
