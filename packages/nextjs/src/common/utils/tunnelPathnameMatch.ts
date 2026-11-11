import type { ServerTunnelOptions } from '@sentry/core';
import { escapeStringForRegex, GLOBAL_OBJ } from '@sentry/core';

const globalWithInjectedValues = GLOBAL_OBJ as typeof GLOBAL_OBJ & {
  _sentryTunnelRoute?: string;
};

/**
 * The path of the tunnel route handler (`app/sentry-tunnel/route.ts`).
 * Users create the file at this path, so the value is a public contract.
 */
export const TUNNEL_ROUTE_HANDLER_PATH = '/sentry-tunnel';

/**
 * The `tunnelRoute` of `withSentryConfig`, which `withSentryConfig` injects: the fixed tunnel path with the `basePath`,
 * or `true` for the path derived from the DSN. The client bundle reads it from `env`. On the server, `@sentry/nextjs` is
 * external, so `env` isn't inlined there and it reads the injected global instead.
 */
export function getInjectedTunnelRoute(): string | true | undefined {
  const tunnelRoute = process.env._sentryTunnelRoute || globalWithInjectedValues._sentryTunnelRoute;
  if (!tunnelRoute) {
    return undefined;
  }

  return tunnelRoute === 'true' ? true : tunnelRoute;
}

/**
 * The managed tunnel the `tunnelRoute` enables on the server, like `serveTunnelIntegration` with these options. A fixed
 * path already has the `basePath`.
 */
export function getTunnelRouteServerOptions(): Omit<ServerTunnelOptions, 'basePath'> | undefined {
  const tunnelRoute = getInjectedTunnelRoute();
  if (!tunnelRoute) {
    return undefined;
  }

  return tunnelRoute === true ? {} : { path: tunnelRoute };
}

/**
 * Returns true when `pathname` is exactly the Sentry tunnel route or a sub-path
 * (`tunnelPath` + `/...`). A plain `startsWith(tunnelPath)` is unsafe: e.g. tunnel
 * `/api/t` must not match `/api/things`.
 */
export function isPathnameUnderSentryTunnelRoute(pathname: string, tunnelPath: string): boolean {
  return pathname === tunnelPath || pathname.startsWith(`${tunnelPath}/`);
}

/**
 * Returns a pattern for the request targets (path and query) of the tunnel path: the path, with an optional trailing
 * slash and any query. It must never match more than the tunnel path, see GHSA-mchm-gjx6-7h55.
 */
export function getTunnelRouteRequestPattern(tunnelPath: string): RegExp {
  return new RegExp(`^${escapeStringForRegex(tunnelPath)}/?(?:\\?|$)`);
}
