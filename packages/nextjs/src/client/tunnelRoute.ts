import type { BrowserOptions } from '@sentry/react';
import { dsnFromString, logger } from '@sentry/utils';

import { DEBUG_BUILD } from '../common/debug-build';

/**
 * Applies the `tunnel` option to the Next.js SDK options based on `withSentryConfig`'s `tunnelRoute` option.
 */
export function applyTunnelRouteOption(options: BrowserOptions): void {
  const tunnelRouteOption = process.env.__sentryRewritesTunnelPath;
  if (tunnelRouteOption && options.dsn) {
    const dsnComponents = dsnFromString(options.dsn);
    if (!dsnComponents) {
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
      DEBUG_BUILD && logger.info(`Tunneling events to "${tunnelPath}"`);
    } else {
      DEBUG_BUILD && logger.warn('Provided DSN is not a Sentry SaaS DSN. Will not tunnel events.');
    }
  }
}
