import type { Options } from '@sentry/core';
import { _INTERNAL_applyTunnelDefaults as applyTunnelDefaults, GLOBAL_OBJ } from '@sentry/core';

/** Set by the generated client config plugin to the app's runtime `app.baseURL`. */
export const NUXT_TUNNEL_BASE_PATH_GLOBAL = '__sentry_nuxt_base_path';

/**
 * Serves the managed tunnel under the app's `app.baseURL`, which a proxy in front of the app may be the only path
 * forwarded to it. It's read from runtime config, so a `NUXT_APP_BASE_URL` set at runtime is honoured too.
 * A `basePath` the user set wins.
 */
export function applyNuxtTunnelBasePath(options: Pick<Options, 'tunnel'>): void {
  const basePath = (GLOBAL_OBJ as { [NUXT_TUNNEL_BASE_PATH_GLOBAL]?: string })[NUXT_TUNNEL_BASE_PATH_GLOBAL];
  options.tunnel = applyTunnelDefaults(options.tunnel, { basePath });
}
