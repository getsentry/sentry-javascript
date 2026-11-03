import { _INTERNAL_safeMathRandom } from '@sentry/core';
import * as fs from 'fs';
import * as path from 'path';
import { TUNNEL_ROUTE_HANDLER_PATH, type TunnelRouteMode } from '../../common/utils/tunnelPathnameMatch';
import type { NextConfigObject, SentryBuildOptions } from '../types';
import { DEFAULT_PAGE_EXTENSIONS } from '../util';

/** The values that the client, server and edge bundles read to find the tunnel route. */
export type TunnelRouteInjectedValues =
  | { _sentryRewritesTunnelPath: string; _sentryTunnelRouteMode: TunnelRouteMode }
  | Record<string, never>;

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

/**
 * Injects a rewrite rule that sends requests from the `tunnelPath` to the tunnel route handler.
 */
export function setUpTunnelHandlerRewrite(userNextConfig: NextConfigObject, tunnelPath: string): void {
  const originalRewrites = userNextConfig.rewrites;
  // Next.js adds the `basePath` and an optional trailing slash.
  const handlerRewrite = { source: tunnelPath, destination: TUNNEL_ROUTE_HANDLER_PATH };

  // `beforeFiles`: a `public/` file or a page at the same path wins over an `afterFiles` rewrite.
  userNextConfig.rewrites = async () => {
    const originalRewritesResult = typeof originalRewrites === 'function' ? await originalRewrites() : [];

    if (Array.isArray(originalRewritesResult)) {
      return { beforeFiles: [handlerRewrite], afterFiles: originalRewritesResult };
    }

    return {
      ...originalRewritesResult,
      beforeFiles: [handlerRewrite, ...(originalRewritesResult.beforeFiles || [])],
    };
  };
}

/**
 * Returns the tunnel route handler file relative to `projectDir` (for example `app/sentry-tunnel/route.ts`), or
 * `undefined` if the project has none.
 *
 * Route groups are not searched: the file must be directly in `app/sentry-tunnel/` or `src/app/sentry-tunnel/`.
 */
export function findTunnelRouteHandlerFile(
  pageExtensions: string[] = DEFAULT_PAGE_EXTENSIONS,
  projectDir: string = process.cwd(),
): string | undefined {
  // Like Next.js, ignore `src/app` if there is a root `app` directory.
  const appDir = ['app', 'src/app'].find(dir => getStats(path.join(projectDir, dir))?.isDirectory());
  if (!appDir) {
    return undefined;
  }

  return pageExtensions
    .map(extension => `${appDir}${TUNNEL_ROUTE_HANDLER_PATH}/route.${extension}`)
    .find(file => getStats(path.join(projectDir, file))?.isFile());
}

function getStats(filePath: string): fs.Stats | undefined {
  try {
    return fs.statSync(filePath);
  } catch {
    return undefined;
  }
}

/**
 * Returns the tunnel path that the client sends envelopes to, and the tunnel route mode.
 * Returns no values if there is no tunnel route, or if it cannot work (static export).
 *
 * Call it after `maybeSetUpTunnelRouteRewriteRules`, which resolves `tunnelRoute: true` to a path.
 */
export function getTunnelRouteInjectedValues(
  userNextConfig: NextConfigObject,
  userSentryOptions: SentryBuildOptions | undefined,
  projectDir: string = process.cwd(),
): TunnelRouteInjectedValues {
  const tunnelRoute = userSentryOptions?.tunnelRoute;
  if (typeof tunnelRoute !== 'string' || !tunnelRoute || userNextConfig.output === 'export') {
    return {};
  }

  return {
    _sentryRewritesTunnelPath: `${userNextConfig.basePath ?? ''}${tunnelRoute}`,
    _sentryTunnelRouteMode: findTunnelRouteHandlerFile(userNextConfig.pageExtensions, projectDir)
      ? 'handler'
      : 'rewrite',
  };
}
