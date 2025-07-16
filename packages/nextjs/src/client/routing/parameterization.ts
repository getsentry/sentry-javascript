import { GLOBAL_OBJ, debug } from '@sentry/core';
import { DEBUG_BUILD } from '../../common/debug-build';
import type { RouteManifest } from '../../config/manifest/types';

const globalWithInjectedManifest = GLOBAL_OBJ as typeof GLOBAL_OBJ & {
  _sentryRouteManifest: RouteManifest | undefined;
};

// Some performance caches
let cachedManifest: RouteManifest | null = null;
let cachedManifestString: string | undefined = undefined;
const compiledRegexCache: Map<string, RegExp> = new Map();
const routeResultCache: Map<string, string | undefined> = new Map();

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
 * Get compiled regex from cache or create and cache it.
 */
function getCompiledRegex(regexString: string): RegExp | null {
  if (compiledRegexCache.has(regexString)) {
    return compiledRegexCache.get(regexString) ?? null;
  }

  try {
    // eslint-disable-next-line @sentry-internal/sdk/no-regexp-constructor -- regex patterns are from build-time route manifest, not user input
    const regex = new RegExp(regexString);
    compiledRegexCache.set(regexString, regex);
    return regex;
  } catch (error) {
    DEBUG_BUILD && debug.warn('Could not compile regex', { regexString, error });
    // Cache the failure to avoid repeated attempts by storing undefined
    return null;
  }
}

/**
 * Get and cache the route manifest from the global object.
 * @returns The parsed route manifest or null if not available/invalid.
 */
function getManifest(): RouteManifest | null {
  if (
    !globalWithInjectedManifest?._sentryRouteManifest ||
    typeof globalWithInjectedManifest._sentryRouteManifest !== 'string'
  ) {
    return null;
  }

  const currentManifestString = globalWithInjectedManifest._sentryRouteManifest;

  // Return cached manifest if the string hasn't changed
  if (cachedManifest && cachedManifestString === currentManifestString) {
    return cachedManifest;
  }

  // Clear caches when manifest changes
  compiledRegexCache.clear();
  routeResultCache.clear();

  let manifest: RouteManifest = {
    staticRoutes: [],
    dynamicRoutes: [],
  };

  // Shallow check if the manifest is actually what we expect it to be
  try {
    manifest = JSON.parse(currentManifestString);
    if (!Array.isArray(manifest.staticRoutes) || !Array.isArray(manifest.dynamicRoutes)) {
      return null;
    }
    // Cache the successfully parsed manifest
    cachedManifest = manifest;
    cachedManifestString = currentManifestString;
    return manifest;
  } catch {
    // Something went wrong while parsing the manifest, so we'll fallback to no parameterization
    DEBUG_BUILD && debug.warn('Could not extract route manifest');
    return null;
  }
}

/**
 * Find matching routes from static and dynamic route collections.
 * @param route - The route to match against.
 * @param staticRoutes - Array of static route objects.
 * @param dynamicRoutes - Array of dynamic route objects.
 * @returns Array of matching route paths.
 */
function findMatchingRoutes(
  route: string,
  staticRoutes: RouteManifest['staticRoutes'],
  dynamicRoutes: RouteManifest['dynamicRoutes'],
): string[] {
  const matches: string[] = [];

  // Static path: no parameterization needed, return empty array
  if (staticRoutes.some(r => r.path === route)) {
    return matches;
  }

  // Dynamic path: find the route pattern that matches the concrete route
  for (const dynamicRoute of dynamicRoutes) {
    if (dynamicRoute.regex) {
      const regex = getCompiledRegex(dynamicRoute.regex);
      if (regex?.test(route)) {
        matches.push(dynamicRoute.path);
      }
    }
  }

  return matches;
}

/**
 * Parameterize a route using the route manifest.
 *
 * @param route - The route to parameterize.
 * @returns The parameterized route or undefined if no parameterization is needed.
 */
export const maybeParameterizeRoute = (route: string): string | undefined => {
  const manifest = getManifest();
  if (!manifest) {
    return undefined;
  }

  // Check route result cache after manifest validation
  if (routeResultCache.has(route)) {
    return routeResultCache.get(route);
  }

  const { staticRoutes, dynamicRoutes } = manifest;
  if (!Array.isArray(staticRoutes) || !Array.isArray(dynamicRoutes)) {
    return undefined;
  }

  const matches = findMatchingRoutes(route, staticRoutes, dynamicRoutes);

  // We can always do the `sort()` call, it will short-circuit when it has one array item
  const result = matches.sort((a, b) => getRouteSpecificity(a) - getRouteSpecificity(b))[0];

  routeResultCache.set(route, result);

  return result;
};
