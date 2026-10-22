import { debug, getClient } from '@sentry/core';
import {
  _INTERNAL_getTunnelPaths as getTunnelPaths,
  handleTunnelRequestIfMatched,
  _INTERNAL_setManagedTunnelDefaults as setManagedTunnelDefaults,
} from '@sentry/core/server';
import { DEBUG_BUILD } from '../common/debug-build';

// Never matches a request, for when the managed tunnel is off.
const DISABLED_TUNNEL_PATH = '/__sentry-tunnel-disabled__';

/**
 * The resource routes that serve the managed tunnel, one per tunnel path. `sentryReactRouter()` adds them to the
 * server build, since React Router has no request hook to answer from and a route matches only one path. Not meant
 * to be used directly.
 *
 * @param basename The app's `basename`, which React Router matches the routes under but leaves in the request URL.
 */
export function createSentryTunnelRoutes(basename?: string): Record<string, Record<string, unknown>> {
  // Runs when the server build loads. Clients created later, e.g. per request on Cloudflare, start with the basename.
  setManagedTunnelDefaults({ basePath: basename });

  // `init` runs from `--import` before the server build loads, so the client and its tunnel paths are usually known.
  if (!getClient()) {
    return { 'sentry-tunnel': makeTunnelRoute('sentry-tunnel', getLazyTunnelPath) };
  }

  return Object.fromEntries(
    getTunnelPaths().map((path, index) => {
      const id = `sentry-tunnel-${index}`;

      return [id, makeTunnelRoute(id, () => path)];
    }),
  );
}

/**
 * The path of the single route added when `init` runs after the server build loads, e.g. per request on Cloudflare.
 * React Router reads it on its first request and keeps it until the server restarts.
 */
function getLazyTunnelPath(): string {
  if (!getClient()) {
    DEBUG_BUILD && debug.warn('The managed tunnel stays off until restart: a request came in before `Sentry.init`.');
    return DISABLED_TUNNEL_PATH;
  }

  const [path, ...otherPaths] = getTunnelPaths();
  if (otherPaths.length) {
    DEBUG_BUILD && debug.warn(`Sentry.init ran after the server build loaded, so only ${path} is served.`);
  }

  return path ?? DISABLED_TUNNEL_PATH;
}

function makeTunnelRoute(id: string, getPath: () => string): Record<string, unknown> {
  return {
    id,
    parentId: undefined,
    index: undefined,
    caseSensitive: undefined,
    get path(): string {
      return getPath();
    },
    module: {
      action: ({ request }: { request: Request }) =>
        handleTunnelRequestIfMatched(request) ?? new Response(null, { status: 404 }),
      loader: () => new Response(null, { status: 405, headers: { Allow: 'POST' } }),
    },
  };
}
