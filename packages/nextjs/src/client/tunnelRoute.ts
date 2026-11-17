import type { BrowserOptions } from '@sentry/react';
import { getInjectedTunnelRoute } from '../common/utils/tunnelPathnameMatch';

/**
 * Sends events through the managed tunnel when `withSentryConfig` has a `tunnelRoute`, unless `Sentry.init` sets its
 * own `tunnel`. A fixed path goes in as `path`, so the browser sends the envelope content type the Vercel rewrite
 * matches, and gets the trailing slash Next.js would otherwise redirect a POST to.
 */
export function applyTunnelRouteOption(options: BrowserOptions): void {
  const tunnelRoute = getInjectedTunnelRoute();
  if (!tunnelRoute || options.tunnel) {
    return;
  }

  if (tunnelRoute === true) {
    options.tunnel = true;
    return;
  }

  options.tunnel = {
    path: tunnelRoute,
    trailingSlash: !!process.env._sentryTrailingSlash && !tunnelRoute.endsWith('/'),
  };
}
