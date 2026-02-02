import { _INTERNAL_safeMathRandom } from '@sentry/core';
import type { NextConfigObject } from '../types';

/**
 * Generates a random tunnel route path that's less likely to be blocked by ad-blockers
 */
function generateRandomTunnelRoute(): string {
  // Generate a random 8-character alphanumeric string
  const randomString = _INTERNAL_safeMathRandom().toString(36).substring(2, 10);
  return `/${randomString}`;
}

/**
 * Resolves the tunnel route based on the user's configuration and the environment.
 * @param tunnelRoute - The user-provided tunnel route option
 */
export function resolveTunnelRoute(tunnelRoute: string | true): string {
  if (process.env.__SENTRY_TUNNEL_ROUTE__) {
    // Reuse cached value from previous build (server/client)
    return process.env.__SENTRY_TUNNEL_ROUTE__;
  }

  const resolvedTunnelRoute = typeof tunnelRoute === 'string' ? tunnelRoute : generateRandomTunnelRoute();

  // Cache for subsequent builds (only during build time)
  // Turbopack runs the config twice, so we need a shared context to avoid generating a new tunnel route for each build.
  // env works well here
  // https://linear.app/getsentry/issue/JS-549/adblock-plus-blocking-requests-to-sentry-and-monitoring-tunnel
  if (resolvedTunnelRoute) {
    process.env.__SENTRY_TUNNEL_ROUTE__ = resolvedTunnelRoute;
  }

  return resolvedTunnelRoute;
}

/**
 * Injects rewrite rules into the Next.js config provided by the user to tunnel
 * requests from the `tunnelPath` to Sentry.
 *
 * See https://nextjs.org/docs/api-reference/next.config.js/rewrites.
 */
export function setUpTunnelRewriteRules(userNextConfig: NextConfigObject, tunnelPath: string): void {
  const originalRewrites = userNextConfig.rewrites;
  // Allow overriding the tunnel destination for E2E tests via environment variable
  const destinationOverride = process.env._SENTRY_TUNNEL_DESTINATION_OVERRIDE;

  // Make sure destinations are statically defined at build time
  const destination = destinationOverride || 'https://o:orgid.ingest.sentry.io/api/:projectid/envelope/?hsts=0';
  const destinationWithRegion =
    destinationOverride || 'https://o:orgid.ingest.:region.sentry.io/api/:projectid/envelope/?hsts=0';

  // This function doesn't take any arguments at the time of writing but we future-proof
  // here in case Next.js ever decides to pass some
  userNextConfig.rewrites = async (...args: unknown[]) => {
    const tunnelRouteRewrite = {
      // Matched rewrite routes will look like the following: `[tunnelPath]?o=[orgid]&p=[projectid]`
      // Nextjs will automatically convert `source` into a regex for us
      source: `${tunnelPath}(/?)`,
      has: [
        {
          type: 'query',
          key: 'o', // short for orgId - we keep it short so matching is harder for ad-blockers
          value: '(?<orgid>\\d*)',
        },
        {
          type: 'query',
          key: 'p', // short for projectId - we keep it short so matching is harder for ad-blockers
          value: '(?<projectid>\\d*)',
        },
      ],
      destination,
    };

    const tunnelRouteRewriteWithRegion = {
      // Matched rewrite routes will look like the following: `[tunnelPath]?o=[orgid]&p=[projectid]?r=[region]`
      // Nextjs will automatically convert `source` into a regex for us
      source: `${tunnelPath}(/?)`,
      has: [
        {
          type: 'query',
          key: 'o', // short for orgId - we keep it short so matching is harder for ad-blockers
          value: '(?<orgid>\\d*)',
        },
        {
          type: 'query',
          key: 'p', // short for projectId - we keep it short so matching is harder for ad-blockers
          value: '(?<projectid>\\d*)',
        },
        {
          type: 'query',
          key: 'r', // short for region - we keep it short so matching is harder for ad-blockers
          value: '(?<region>[a-z]{2})',
        },
      ],
      destination: destinationWithRegion,
    };

    // Order of these is important, they get applied first to last.
    const newRewrites = [tunnelRouteRewriteWithRegion, tunnelRouteRewrite];

    if (typeof originalRewrites !== 'function') {
      return newRewrites;
    }

    // @ts-expect-error Expected 0 arguments but got 1 - this is from the future-proofing mentioned above, so we don't care about it
    const originalRewritesResult = await originalRewrites(...args);

    if (Array.isArray(originalRewritesResult)) {
      return [...newRewrites, ...originalRewritesResult];
    } else {
      return {
        ...originalRewritesResult,
        beforeFiles: [...newRewrites, ...(originalRewritesResult.beforeFiles || [])],
      };
    }
  };
}
