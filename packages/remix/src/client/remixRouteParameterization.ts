import { debug, GLOBAL_OBJ } from '@sentry/core';
import type { RouteManifest } from '../config/remixRouteManifest';
import { DEBUG_BUILD } from '../utils/debug-build';

const globalWithInjectedManifest = GLOBAL_OBJ as typeof GLOBAL_OBJ & {
  _sentryRemixRouteManifest: string | undefined;
};

// Performance caches
let cachedManifest: RouteManifest | null = null;
let cachedManifestString: string | undefined = undefined;
const compiledRegexCache: Map<string, RegExp> = new Map();
const routeResultCache: Map<string, string | undefined> = new Map();

/**
 * Calculate specificity score for route matching. Lower scores = more specific routes.
 */
function getRouteSpecificity(routePath: string): number {
  const segments = routePath.split('/').filter(Boolean);
  let score = 0;

  for (const segment of segments) {
    if (segment.startsWith(':')) {
      const paramName = segment.substring(1);
      if (paramName.endsWith('*')) {
        // Splat/catchall routes are least specific
        score += 100;
      } else {
        // Dynamic segments are more specific than splats
        score += 10;
      }
    }
    // Static segments add 0 (most specific)
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
    return null;
  }
}

/**
 * Get and cache the route manifest from the global object.
 * @returns The parsed route manifest or null if not available/invalid.
 */
function getManifest(): RouteManifest | null {
  if (
    !globalWithInjectedManifest?._sentryRemixRouteManifest ||
    typeof globalWithInjectedManifest._sentryRemixRouteManifest !== 'string'
  ) {
    return null;
  }

  const currentManifestString = globalWithInjectedManifest._sentryRemixRouteManifest;

  if (cachedManifest && cachedManifestString === currentManifestString) {
    return cachedManifest;
  }

  compiledRegexCache.clear();
  routeResultCache.clear();

  let manifest: RouteManifest = {
    staticRoutes: [],
    dynamicRoutes: [],
  };

  try {
    // The manifest string is JSON-stringified in the Vite plugin for safe injection into JavaScript.
    // We parse once to convert the JSON string back to an object.
    manifest = JSON.parse(currentManifestString);
    if (!Array.isArray(manifest.staticRoutes) || !Array.isArray(manifest.dynamicRoutes)) {
      return null;
    }

    cachedManifest = manifest;
    cachedManifestString = currentManifestString;
    return manifest;
  } catch (error) {
    DEBUG_BUILD && debug.warn('Could not extract route manifest');
    return null;
  }
}

/**
 * Find matching routes from static and dynamic route collections.
 * @param route - The route to match against.
 * @param staticRoutes - Array of static route objects.
 * @param dynamicRoutes - Array of dynamic route objects.
 * @returns Array of matching parameterized route paths.
 */
function findMatchingRoutes(
  route: string,
  staticRoutes: RouteManifest['staticRoutes'],
  dynamicRoutes: RouteManifest['dynamicRoutes'],
): string[] {
  const matches: string[] = [];

  // Static routes don't need parameterization - return empty to keep source as 'url'
  if (staticRoutes.some(r => r.path === route)) {
    return matches;
  }

  // Check dynamic routes
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
 * Check if the route manifest is available (injected by the Vite plugin).
 * @returns True if the manifest is available, false otherwise.
 */
export function hasManifest(): boolean {
  return getManifest() !== null;
}

/**
 * Parameterize a route using the route manifest.
 *
 * @param route - The route to parameterize.
 * @returns The parameterized route or undefined if no parameterization is needed.
 */
export const maybeParameterizeRemixRoute = (route: string): string | undefined => {
  const manifest = getManifest();
  if (!manifest) {
    return undefined;
  }

  if (routeResultCache.has(route)) {
    return routeResultCache.get(route);
  }

  const { staticRoutes, dynamicRoutes } = manifest;
  const matches = findMatchingRoutes(route, staticRoutes, dynamicRoutes);

  const result = matches.sort((a, b) => getRouteSpecificity(a) - getRouteSpecificity(b))[0];

  routeResultCache.set(route, result);

  return result;
};
