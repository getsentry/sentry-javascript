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

// Specificity ranks for a single route segment, from most to least specific. `END` is the rank of
// the position just past the last segment of a route, so that a route which stops is compared
// against whatever the longer route continues with.
const SEGMENT_STATIC = 0;
const SEGMENT_DYNAMIC = 1;
const SEGMENT_END = 2;
const SEGMENT_SPLAT = 3;

/**
 * Calculate the specificity rank for a single route segment. Lower ranks = more specific segments.
 */
function getSegmentSpecificity(segment: string | undefined): number {
  if (segment === undefined) {
    // The route has no more segments
    return SEGMENT_END;
  }
  if (!segment.startsWith(':')) {
    // Static segments are the most specific
    return SEGMENT_STATIC;
  }

  // Splat/catchall routes are the least specific
  return segment.substring(1).endsWith('*') ? SEGMENT_SPLAT : SEGMENT_DYNAMIC;
}

/**
 * Compare two route paths by specificity, ordering the most specific route first.
 *
 * Routes are compared segment by segment, with the first segment they disagree on deciding the
 * winner. Comparing aggregate scores instead would rank a short splat like '/:lang/:*' above a
 * longer but strictly narrower route like '/:lang/guides/:category/:*', because the longer route
 * accumulates more score simply by having more segments.
 *
 * Routes of differing lengths are compared one segment past the shorter one, where `SEGMENT_END`
 * decides whether continuing narrows the route or widens it: '/:lang/foo' is more specific than
 * '/:lang', but '/:lang' is more specific than '/:lang/:*'.
 */
function compareRouteSpecificity(routePathA: string, routePathB: string): number {
  const segmentsA = routePathA.split('/').filter(Boolean);
  const segmentsB = routePathB.split('/').filter(Boolean);

  const comparedSegmentCount = Math.min(segmentsA.length, segmentsB.length) + 1;
  for (let i = 0; i < comparedSegmentCount; i++) {
    const difference = getSegmentSpecificity(segmentsA[i]) - getSegmentSpecificity(segmentsB[i]);
    if (difference !== 0) {
      return difference;
    }
  }

  return 0;
}

/**
 * Get compiled regex from cache or create and cache it.
 */
function getCompiledRegex(regexString: string): RegExp | null {
  if (compiledRegexCache.has(regexString)) {
    return compiledRegexCache.get(regexString) ?? null;
  }

  try {
    // oxlint-disable-next-line sdk/no-regexp-constructor -- regex patterns are from build-time route manifest, not user input
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
  } catch {
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

  // Static routes don't need parameterization, return the route itself as already parameterized
  if (staticRoutes.some(r => r.path === route)) {
    return [route];
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
 * @returns The parameterized route or undefined if not able to parameterize.
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

  const result = matches.sort(compareRouteSpecificity)[0];

  routeResultCache.set(route, result);

  return result;
};
