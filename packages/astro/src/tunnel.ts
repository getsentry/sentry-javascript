import type { Options, TunnelOptions } from '@sentry/core';
import { _INTERNAL_applyTunnelDefaults as applyTunnelDefaults, GLOBAL_OBJ } from '@sentry/core';

/** Set by the Sentry Astro integration from the `base` and `trailingSlash` config. */
export const TUNNEL_OPTIONS_GLOBAL = '__sentry_astro_tunnel_options';

/**
 * Serves the managed tunnel under the app's base path and with Astro's trailing slash policy, which Astro enforces
 * before any middleware runs. Options the user set win.
 */
export function applyAstroTunnelOptions(options: Pick<Options, 'tunnel'>): void {
  const astroTunnelOptions = (GLOBAL_OBJ as { [TUNNEL_OPTIONS_GLOBAL]?: TunnelOptions })[TUNNEL_OPTIONS_GLOBAL];
  options.tunnel = applyTunnelDefaults(options.tunnel, astroTunnelOptions);
}
