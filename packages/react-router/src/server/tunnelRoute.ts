import { debug, getClient, getTunnelPaths, handleTunnelRequestIfMatched } from '@sentry/core';
import { DEBUG_BUILD } from '../common/debug-build';

// Never matches a request, for when the managed tunnel is off.
const DISABLED_TUNNEL_PATH = '/__sentry-tunnel-disabled__';

/**
 * A resource route that serves the managed tunnel. `sentryReactRouter()` adds it to the server build, since React
 * Router has no request hook to answer from. Not meant to be used directly.
 */
export function createSentryTunnelRoute(): Record<string, unknown> {
  return {
    id: 'sentry-tunnel',
    parentId: undefined,
    index: undefined,
    caseSensitive: undefined,
    // React Router reads the path once, on its first request, and keeps it until the server restarts.
    get path(): string {
      if (!getClient()) {
        DEBUG_BUILD &&
          debug.warn('The managed tunnel stays off until restart: a request came in before `Sentry.init`.');
        return DISABLED_TUNNEL_PATH;
      }

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
