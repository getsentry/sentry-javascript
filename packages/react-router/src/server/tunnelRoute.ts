import { _INTERNAL_setTunnelDefaults as setTunnelDefaults } from '@sentry/core/server';

/**
 * Serves the managed tunnel under the app's `basename`, which React Router leaves in the request URL.
 * `sentryReactRouter()` calls it from the server build.
 *
 * @param basename The app's `basename`.
 */
export function setTunnelBasePath(basename?: string): void {
  // Runs when the server build loads. Clients created later, e.g. per request on Cloudflare, start with the basename.
  setTunnelDefaults({ basePath: basename });
}
