import { debug, dsnFromString, GLOBAL_OBJ } from '@sentry/core';
import type { BrowserOptions } from '@sentry/react';
import { DEBUG_BUILD } from '../common/debug-build';
import type { TunnelRouteMode } from '../common/utils/tunnelPathnameMatch';

const globalWithInjectedValues = GLOBAL_OBJ as typeof GLOBAL_OBJ & {
  _sentryRewritesTunnelPath?: string;
  _sentryTunnelRouteMode?: TunnelRouteMode;
};

/**
 * Applies the `tunnel` option to the Next.js SDK options based on `withSentryConfig`'s `tunnelRoute` option.
 */
export function applyTunnelRouteOption(options: BrowserOptions): void {
  const tunnelRouteOption = process.env._sentryRewritesTunnelPath || globalWithInjectedValues._sentryRewritesTunnelPath;
  if (tunnelRouteOption && options.dsn) {
    const dsnComponents = dsnFromString(options.dsn);
    if (!dsnComponents) {
      return;
    }

    // The handler reads the DSN from the envelope, so it needs no query and no SaaS DSN.
    const tunnelRouteMode = process.env._sentryTunnelRouteMode || globalWithInjectedValues._sentryTunnelRouteMode;
    if (tunnelRouteMode === 'handler') {
      options.tunnel = tunnelRouteOption;
      DEBUG_BUILD && debug.log(`Tunneling events to "${tunnelRouteOption}"`);
      return;
    }

    const sentrySaasDsnMatch = dsnComponents.host.match(/^o(\d+)\.ingest(?:\.([a-z]{2}))?\.sentry\.io$/);
    if (sentrySaasDsnMatch) {
      const orgId = sentrySaasDsnMatch[1];
      const regionCode = sentrySaasDsnMatch[2];
      let tunnelPath = `${tunnelRouteOption}?o=${orgId}&p=${dsnComponents.projectId}`;
      if (regionCode) {
        tunnelPath += `&r=${regionCode}`;
      }
      options.tunnel = tunnelPath;
      // The tunnel route is same-origin, so fetch would include credentials (cookies, HTTP authentication) that the
      // tunnel does not need.
      options.transportOptions = {
        ...options.transportOptions,
        fetchOptions: { credentials: 'omit', ...options.transportOptions?.fetchOptions },
      };
      DEBUG_BUILD && debug.log(`Tunneling events to "${tunnelPath}"`);
    } else {
      DEBUG_BUILD && debug.warn('Provided DSN is not a Sentry SaaS DSN. Will not tunnel events.');
    }
  }
}
