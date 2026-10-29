import { _INTERNAL_setManagedTunnelDefaults as setManagedTunnelDefaults } from '@sentry/core/server';
import { useRuntimeConfig } from 'nitro/runtime-config';
import type { NitroAppPlugin } from 'nitro/types';

/**
 * Serves the managed tunnel under Nuxt's `app.baseURL` on Nuxt v5+ (Nitro v3+). The runtime answers the requests.
 */
export default (() => {
  // `useRuntimeConfig` also picks up a `NUXT_APP_BASE_URL` set at runtime, the same value the browser gets.
  setManagedTunnelDefaults({ basePath: (useRuntimeConfig() as { app?: { baseURL?: string } }).app?.baseURL });
}) satisfies NitroAppPlugin;
