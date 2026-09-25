/**
 * Returns true when `pathname` is exactly the Sentry tunnel route or a sub-path
 * (`tunnelPath` + `/...`). A plain `startsWith(tunnelPath)` is unsafe: e.g. tunnel
 * `/api/t` must not match `/api/things`.
 */
export function isPathnameUnderSentryTunnelRoute(pathname: string, tunnelPath: string): boolean {
  return pathname === tunnelPath || pathname.startsWith(`${tunnelPath}/`);
}
