import type { Options } from '@sentry/core';
import { applyTunnelDefaults } from '@sentry/core';

/** Set on the server by `withSentry` to the app's `server.baseURL`. */
export const TUNNEL_BASE_PATH_GLOBAL = '__sentry_solidstart_base_path';

declare const __SENTRY_SOLIDSTART_TUNNEL_BASE_PATH__: string | undefined;

/**
 * Normalizes SolidStart's `server.baseURL` to the base path the managed tunnel is served under.
 */
export function toTunnelBasePath(baseURL: string | undefined): string {
  return (baseURL ?? '').replace(/^\.?\/+|\/+$/g, '').replace(/^(?=.)/, '/');
}

/**
 * Serves the browser's managed tunnel under the app's `server.baseURL`, which `withSentry` defines at build time.
 * A `basePath` the user set wins.
 */
export function applyTunnelBasePath(options: Pick<Options, 'tunnel'>): void {
  const basePath =
    typeof __SENTRY_SOLIDSTART_TUNNEL_BASE_PATH__ !== 'undefined' ? __SENTRY_SOLIDSTART_TUNNEL_BASE_PATH__ : '';
  options.tunnel = applyTunnelDefaults(options.tunnel, basePath ? { basePath } : undefined);
}
