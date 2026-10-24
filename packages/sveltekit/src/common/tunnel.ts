import type { Options } from '@sentry/core';
import { _INTERNAL_applyTunnelDefaults as applyTunnelDefaults, GLOBAL_OBJ } from '@sentry/core';

/** Set by `sentrySvelteKit()` to the app's `paths.base`. */
export const TUNNEL_BASE_PATH_GLOBAL = '__sentry_sveltekit_base_path';

/**
 * Serves the managed tunnel under the app's base path, which SvelteKit requires for every request it handles.
 * A `basePath` the user set wins.
 */
export function applyTunnelBasePath(options: Pick<Options, 'tunnel'>): void {
  const basePath = (GLOBAL_OBJ as { [TUNNEL_BASE_PATH_GLOBAL]?: string })[TUNNEL_BASE_PATH_GLOBAL];
  options.tunnel = applyTunnelDefaults(options.tunnel, { basePath });
}
