import { debug, getClient, getTunnelPaths, handleTunnelRequestIfMatched, setManagedTunnelBasePath } from '@sentry/core';
import { DEBUG_BUILD } from '../common/debug-build';

// Never matches a request, for when the managed tunnel is off.
const DISABLED_TUNNEL_PATH = '/__sentry-tunnel-disabled__';

/**
 * A resource route that serves the managed tunnel. `sentryReactRouter()` adds it to the server build, since React
 * Router has no request hook to answer from. Not meant to be used directly.
 *
 * @param basename The app's `basename`, which React Router matches the route under but leaves in the request URL.
 */
export function createSentryTunnelRoute(basename?: string): Record<string, unknown> {
  // `init` runs from `--import` before the server build loads, so the client is usually there already.
  setManagedTunnelBasePath(getClient(), basename);

  return {
    id: 'sentry-tunnel',
    parentId: undefined,
    index: undefined,
    caseSensitive: undefined,
    // React Router reads the path once, on its first request, and keeps it until the server restarts.
    get path(): string {
      const client = getClient();
      if (!client) {
        DEBUG_BUILD &&
          debug.warn('The managed tunnel stays off until restart: a request came in before `Sentry.init`.');
        return DISABLED_TUNNEL_PATH;
      }

      setManagedTunnelBasePath(client, basename);

      const [path, ...otherPaths] = getTunnelPaths();
      if (otherPaths.length) {
        DEBUG_BUILD && debug.warn(`React Router can only serve one managed tunnel path, so only ${path} is served.`);
      }

      return path ?? DISABLED_TUNNEL_PATH;
    },
    module: {
      action: ({ request }: { request: Request }) =>
        handleTunnelRequestIfMatched(request) ?? new Response(null, { status: 404 }),
      loader: () => new Response(null, { status: 405, headers: { Allow: 'POST' } }),
    },
  };
}
