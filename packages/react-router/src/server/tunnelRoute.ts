import { _INTERNAL_setManagedTunnelDefaults as setManagedTunnelDefaults } from '@sentry/core/server';

/**
 * Serves the managed tunnel under the app's `basename`, which React Router leaves in the request URL. The runtime
 * answers the requests, so it adds no routes. `sentryReactRouter()` calls it from the server build. Not meant to be
 * used directly.
 *
 * @param basename The app's `basename`.
 */
export function createSentryTunnelRoutes(basename?: string): Record<string, Record<string, unknown>> {
  // Runs when the server build loads. Clients created later, e.g. per request on Cloudflare, start with the basename.
  setManagedTunnelDefaults({ basePath: basename });

  return {};
}
