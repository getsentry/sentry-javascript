import { _INTERNAL_setManagedTunnelDefaults as setManagedTunnelDefaults } from '@sentry/core/server';
import type { NitroAppPlugin } from 'nitropack';
import { useRuntimeConfig } from 'nitropack/runtime';

/**
 * Serves the managed tunnel under Nuxt's `app.baseURL` on Nuxt v3 and v4 (Nitro v2). The runtime answers the
 * requests.
 */
export default (() => {
  // `useRuntimeConfig` also picks up a `NUXT_APP_BASE_URL` set at runtime, the same value the browser gets.
  setManagedTunnelDefaults({ basePath: useRuntimeConfig().app?.baseURL });
}) satisfies NitroAppPlugin;
