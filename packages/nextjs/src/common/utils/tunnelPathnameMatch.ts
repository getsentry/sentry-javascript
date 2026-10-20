import { escapeStringForRegex } from '@sentry/core';

/**
 * The path of the tunnel route handler (`app/sentry-tunnel/route.ts`).
 * Users create the file at this path, so the value is a public contract.
 */
export const TUNNEL_ROUTE_HANDLER_PATH = '/sentry-tunnel';

/**
 * `rewrite`: the tunnel route proxies requests to Sentry with all their headers.
 * `handler`: the tunnel route goes to the tunnel route handler, which forwards only the envelope.
 */
export type TunnelRouteMode = 'rewrite' | 'handler';

/**
 * Returns true when `pathname` is exactly the Sentry tunnel route or a sub-path
 * (`tunnelPath` + `/...`). A plain `startsWith(tunnelPath)` is unsafe: e.g. tunnel
 * `/api/t` must not match `/api/things`.
 */
export function isPathnameUnderSentryTunnelRoute(pathname: string, tunnelPath: string): boolean {
  return pathname === tunnelPath || pathname.startsWith(`${tunnelPath}/`);
}

/**
 * Returns true only for requests the tunnel rewrite (see `setUpTunnelRewriteRules`) would serve.
 *
 * This decides whether the user's middleware is skipped, so it must never be broader than the rewrite:
 * anything it matches that Next.js does not rewrite to Sentry reaches the app without middleware.
 */
export function isSentryTunnelRequest(request: Request, tunnelPath: string): boolean {
  // The SDK transport only ever sends POST requests
  if (request.method !== 'POST') {
    return false;
  }

  const url = new URL(request.url);

  if (url.pathname !== tunnelPath && url.pathname !== `${tunnelPath}/`) {
    return false;
  }

  // Next.js evaluates `has` conditions against the last value of a repeated query param, so every value has to qualify
  return ['o', 'p'].every(key => {
    const values = url.searchParams.getAll(key);
    return values.length > 0 && values.every(value => /^\d+$/.test(value));
  });
}

/**
 * Returns a pattern for the request targets (path and query) that the tunnel rewrite serves.
 * It must never match more than the rewrite, see GHSA-mchm-gjx6-7h55.
 *
 * - `handler`: the path, with an optional trailing slash and any query.
 * - `rewrite`: also exactly the query that `applyTunnelRouteOption` sends. A looser query match is unsafe, because
 *   Next.js reads the last value of a repeated param.
 */
export function getTunnelRouteRequestPattern(tunnelPath: string, tunnelRouteMode: TunnelRouteMode): RegExp {
  const pathPattern = `^${escapeStringForRegex(tunnelPath)}/?`;
  return tunnelRouteMode === 'handler'
    ? new RegExp(`${pathPattern}(?:\\?|$)`)
    : new RegExp(`${pathPattern}\\?o=\\d+&p=\\d+(?:&r=[a-z]{2})?$`);
}
