import { consoleSandbox } from '@sentry/core';
import type { BrowserOptions as ReactBrowserOptions } from '@sentry/react';

declare const __SENTRY_TANSTACKSTART_TUNNEL_ROUTE__: string | undefined;

let hasWarnedAboutManagedTunnelRouteOverride = false;

/**
 * Applies the managed tunnel route from `sentryTanstackStart({ tunnelRoute: ... })` unless the user already
 * configured an explicit runtime `tunnel` option in `Sentry.init()`.
 */
export function applyTunnelRouteOption(options: ReactBrowserOptions): void {
  const managedTunnelRoute =
    typeof __SENTRY_TANSTACKSTART_TUNNEL_ROUTE__ !== 'undefined' ? __SENTRY_TANSTACKSTART_TUNNEL_ROUTE__ : undefined;

  if (!managedTunnelRoute) {
    return;
  }

  if (options.tunnel) {
    if (!hasWarnedAboutManagedTunnelRouteOverride) {
      hasWarnedAboutManagedTunnelRouteOverride = true;
      consoleSandbox(() => {
        // eslint-disable-next-line no-console
        console.warn(
          '[@sentry/tanstackstart-react] `Sentry.init({ tunnel: ... })` overrides the managed `sentryTanstackStart({ tunnelRoute: ... })` route. Remove the runtime `tunnel` option if you want the managed tunnel route to be used.',
        );
      });
    }

    return;
  }

  options.tunnel = managedTunnelRoute;
}
