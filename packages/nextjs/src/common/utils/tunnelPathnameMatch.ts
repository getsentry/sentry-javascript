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
