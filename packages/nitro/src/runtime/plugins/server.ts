import { _INTERNAL_setManagedTunnelDefaults as setManagedTunnelDefaults } from '@sentry/core/server';
import { definePlugin } from 'nitro';
import { useRuntimeConfig } from 'nitro/runtime-config';
import { captureErrorHook } from '../hooks/captureErrorHook';

export default definePlugin(nitroApp => {
  nitroApp.hooks.hook('error', captureErrorHook);

  // The runtime answers managed tunnel requests, under Nitro's `baseURL` unless a framework serves the app under
  // another prefix: `@sentry/solidstart` sets `sentryTunnelBasePath` to Vite's `base`.
  const runtimeConfig = useRuntimeConfig() as { app?: { baseURL?: string }; sentryTunnelBasePath?: string };
  setManagedTunnelDefaults({ basePath: runtimeConfig.sentryTunnelBasePath || runtimeConfig.app?.baseURL });
});
