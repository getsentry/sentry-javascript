import { dsnFromString, logger } from '@sentry/utils';

import { NextjsOptions } from './nextjsOptions';

const globalWithInjectedValues = global as typeof global & {
  __sentryRewritesTunnelPath__?: string;
};

/**
 * Applies the `tunnel` option to the Next.js SDK options based on `withSentryConfig`'s `tunnelRoute` option.
 */
export function applyTunnelRouteOption(options: NextjsOptions): void {
  const tunnelRouteOption = globalWithInjectedValues.__sentryRewritesTunnelPath__;
  if (tunnelRouteOption && options.dsn) {
    const dsnComponents = dsnFromString(options.dsn);
    const sentrySaasDsnMatch = dsnComponents.host.match(/^o(\d+)\.ingest\.sentry\.io$/);
    if (!sentrySaasDsnMatch) {
      __DEBUG_BUILD__ && logger.warn('Provided DSN is not a Sentry SaaS DSN. Will not tunnel events.');
    } else if (!dsnComponents.publicKey) {
      __DEBUG_BUILD__ && logger.warn('DSN is missing public key. Will not tunnel events.');
    } else {
      const orgId = sentrySaasDsnMatch[1];
      const tunnelPath = `${tunnelRouteOption}?o=${orgId}&p=${dsnComponents.projectId}&k=${dsnComponents.publicKey}`;
      options.tunnel = tunnelPath;
      __DEBUG_BUILD__ && logger.info(`Tunneling events to "${tunnelPath}"`);
    }
  }
}
