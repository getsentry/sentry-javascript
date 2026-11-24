import type { Options } from '@sentry/core';
import { _INTERNAL_applyBrowserTunnelDefaults as applyBrowserTunnelDefaults, GLOBAL_OBJ } from '@sentry/core';

/** Holds the app's `server.baseURL` on SolidStart 1 servers. Set by the server bundle and the `instrument.server` file. */
export const TUNNEL_BASE_PATH_GLOBAL = '__sentry_solidstart_base_path';

declare const __SENTRY_SOLIDSTART_TUNNEL_BASE_PATH__: string | undefined;

/**
 * Returns the app's base path without a trailing slash. The build defines it where it bundles the SDK: in the browser
 * and in the SolidStart 2 server. The SolidStart 1 server loads the SDK as an external module and reads the global.
 */
export function getBasePath(): string {
  return typeof __SENTRY_SOLIDSTART_TUNNEL_BASE_PATH__ !== 'undefined'
    ? __SENTRY_SOLIDSTART_TUNNEL_BASE_PATH__
    : ((GLOBAL_OBJ as { [TUNNEL_BASE_PATH_GLOBAL]?: string })[TUNNEL_BASE_PATH_GLOBAL] ?? '');
}

/**
 * Serves the browser's managed tunnel under the app's base path, which `withSentry` (SolidStart 1) or
 * `sentrySolidStart` (SolidStart 2) defines at build time. A `basePath` the user set wins.
 */
export function applyTunnelBasePath(options: Pick<Options, 'tunnel'>): void {
  options.tunnel = applyBrowserTunnelDefaults(options.tunnel, { basePath: getBasePath() });
}
