import type { Options } from '@sentry/core';
import { _INTERNAL_applyTunnelDefaults as applyTunnelDefaults } from '@sentry/core';

/** Set on the server by `withSentry` to the app's `server.baseURL`. */
export const TUNNEL_BASE_PATH_GLOBAL = '__sentry_solidstart_base_path';

declare const __SENTRY_SOLIDSTART_TUNNEL_BASE_PATH__: string | undefined;

/**
 * Serves the browser's managed tunnel under the app's base path, which `withSentry` (SolidStart 1) or
 * `sentrySolidStart` (SolidStart 2) defines at build time. A `basePath` the user set wins.
 */
export function applyTunnelBasePath(options: Pick<Options, 'tunnel'>): void {
  const basePath =
    typeof __SENTRY_SOLIDSTART_TUNNEL_BASE_PATH__ !== 'undefined' ? __SENTRY_SOLIDSTART_TUNNEL_BASE_PATH__ : '';
  options.tunnel = applyTunnelDefaults(options.tunnel, { basePath });
}
