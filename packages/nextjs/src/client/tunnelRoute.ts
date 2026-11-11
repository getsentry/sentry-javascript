import type { BrowserOptions } from '@sentry/react';
import { getInjectedTunnelRoute } from '../common/utils/tunnelPathnameMatch';

/**
 * Sends events through the managed tunnel when `withSentryConfig` has a `tunnelRoute`, unless `Sentry.init` sets its
 * own `tunnel`. A fixed path gets the trailing slash Next.js would otherwise redirect a POST to.
 */
export function applyTunnelRouteOption(options: BrowserOptions): void {
  const tunnelRoute = getInjectedTunnelRoute();
  if (!tunnelRoute || options.tunnel) {
    return;
  }

  options.tunnel =
    typeof tunnelRoute === 'string' && process.env._sentryTrailingSlash && !tunnelRoute.endsWith('/')
      ? `${tunnelRoute}/`
      : tunnelRoute;
}
