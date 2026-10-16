import { HTTP_TARGET } from '@sentry/conventions/attributes';
import type { Options, TunnelOptions } from '@sentry/core';
import { escapeStringForRegex, getTunnelPaths, GLOBAL_OBJ } from '@sentry/core';

/**
 * The route the managed tunnel rewrite points at. The user's `app/sentry-tunnel/route.ts` answers it.
 */
export const MANAGED_TUNNEL_ROUTE = '/sentry-tunnel';

/**
 * The query parameter that carries the original request path through the rewrite.
 */
export const MANAGED_TUNNEL_PATH_PARAM = 'p';

/**
 * The tunnel options `withSentryConfig` injects for `tunnelRoute`.
 */
export type ManagedTunnelOptions = Pick<TunnelOptions, 'path' | 'allowedDsns'> & { basePath: string };

const globalWithInjectedValues = GLOBAL_OBJ as typeof GLOBAL_OBJ & {
  _sentryManagedTunnel?: ManagedTunnelOptions;
};

/**
 * The tunnel options `withSentryConfig` injected, if `tunnelRoute` is set.
 *
 * The client bundle reads them from `env`. The server keeps `@sentry/nextjs` external, where `env` isn't inlined,
 * so it reads the injected global instead.
 */
export function getInjectedManagedTunnelOptions(): ManagedTunnelOptions | undefined {
  if (globalWithInjectedValues._sentryManagedTunnel) {
    return globalWithInjectedValues._sentryManagedTunnel;
  }

  const injected = process.env._sentryManagedTunnel;

  return injected ? (JSON.parse(injected) as ManagedTunnelOptions) : undefined;
}

/**
 * Drops Next.js' own spans for managed tunnel requests and for the tunnel route.
 *
 * Next.js sets the request path as `http.target`, not `url.path`, and streamed spans are only matched against
 * `ignoreSpans` when they start, so core's `url.path` filter never sees them.
 */
export function getManagedTunnelSpanFilter(
  tunnelOptions: TunnelOptions,
  dsn: string | undefined,
): NonNullable<Options['ignoreSpans']>[number] | undefined {
  const paths = getTunnelPaths({ ...tunnelOptions, allowedDsns: tunnelOptions.allowedDsns ?? (dsn ? [dsn] : []) });
  if (!paths.length) {
    return undefined;
  }

  const basePath = escapeStringForRegex(tunnelOptions.basePath?.replace(/\/$/, '') ?? '');
  const routes = [...paths, MANAGED_TUNNEL_ROUTE].map(escapeStringForRegex).join('|');

  // Next.js still emits the old semantic conventions.
  // oxlint-disable-next-line sdk/no-regexp-constructor, typescript/no-deprecated -- escaped config values, see above
  return { attributes: { [HTTP_TARGET]: new RegExp(`^${basePath}(?:${routes})/?(?:\\?|$)`) } };
}
