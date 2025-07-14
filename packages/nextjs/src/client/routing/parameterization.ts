import { GLOBAL_OBJ, logger } from '@sentry/core';
import { DEBUG_BUILD } from '../../common/debug-build';
import type { RouteManifest } from '../../config/manifest/types';

const globalWithInjectedManifest = GLOBAL_OBJ as typeof GLOBAL_OBJ & {
  _sentryRouteManifest: RouteManifest | undefined;
};

/**
 * Calculate the specificity score for a route path.
 * Lower scores indicate more specific routes.
 */
function getRouteSpecificity(routePath: string): number {
  const segments = routePath.split('/').filter(Boolean);
  let score = 0;

  for (const segment of segments) {
    if (segment.startsWith(':')) {
      const paramName = segment.substring(1);
      if (paramName.endsWith('*?')) {
        // Optional catch-all: [[...param]]
        score += 1000;
      } else if (paramName.endsWith('*')) {
        // Required catch-all: [...param]
        score += 100;
      } else {
        // Regular dynamic segment: [param]
        score += 10;
      }
    }
    // Static segments add 0 to score as they are most specific
  }

  return score;
}

/**
 * Parameterize a route using the route manifest.
 *
 * @param route - The route to parameterize.
 * @returns The parameterized route or undefined if no parameterization is needed.
 */
export const maybeParameterizeRoute = (route: string): string | undefined => {
  if (
    !globalWithInjectedManifest._sentryRouteManifest ||
    typeof globalWithInjectedManifest._sentryRouteManifest !== 'string'
  ) {
    return undefined;
  }

  let manifest: RouteManifest = {
    staticRoutes: [],
    dynamicRoutes: [],
  };

  // Shallow check if the manifest is actually what we expect it to be
  try {
    manifest = JSON.parse(globalWithInjectedManifest._sentryRouteManifest);
    if (!Array.isArray(manifest.staticRoutes) || !Array.isArray(manifest.dynamicRoutes)) {
      return undefined;
    }
  } catch (error) {
    DEBUG_BUILD && logger.warn('Could not extract route manifest');
    // Something went wrong while parsing the manifest, so we'll fallback to no parameterization
    return undefined;
  }

  // Static path: no parameterization needed
  if (manifest.staticRoutes.some(r => r.path === route)) {
    return undefined;
  }

  const matches: string[] = [];

  // Dynamic path: find the route pattern that matches the concrete route
  for (const dynamicRoute of manifest.dynamicRoutes) {
    if (dynamicRoute.regex) {
      try {
        // eslint-disable-next-line @sentry-internal/sdk/no-regexp-constructor -- regex patterns are from build-time route manifest, not user input
        const regex = new RegExp(dynamicRoute.regex);
        if (regex.test(route)) {
          matches.push(dynamicRoute.path);
        }
      } catch (error) {
        // Just skip this route in case of invalid regex
        continue;
      }
    }
  }

  if (matches.length === 1) {
    return matches[0];
  } else if (matches.length > 1) {
    // Only calculate specificity when we have multiple matches like [param] and [...params]
    return matches.sort((a, b) => getRouteSpecificity(a) - getRouteSpecificity(b))[0];
  }

  return undefined;
};
