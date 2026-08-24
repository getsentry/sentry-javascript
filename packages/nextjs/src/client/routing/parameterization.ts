import { debug, GLOBAL_OBJ } from '@sentry/core';
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

const globalWithInjectedBasePath = GLOBAL_OBJ as typeof GLOBAL_OBJ & {
  _sentryBasePath: string | undefined;
};

/**
 * Strips trailing slash from a pathname, unless it's the root path.
 * This normalizes paths like '/about/' to '/about' to handle Next.js `trailingSlash: true` config.
 */
export function stripTrailingSlash(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
}

function getBasePath(): string | undefined {
  return process.env._sentryBasePath ?? globalWithInjectedBasePath._sentryBasePath;
}

/**
 * Prefixes a pathname with the configured `basePath` when it is missing.
 *
 * The App Router manifest is generated with `basePath` baked into every route, so a pathname that
 * lacks it matches nothing.
 */
export function withBasePath(pathname: string): string {
  const basePath = getBasePath();

  return basePath && !pathname.startsWith(basePath) ? `${basePath}${pathname}` : pathname;
}

/**
 * Removes the configured `basePath` from a pathname.
 *
 * The opposite of {@link withBasePath}, because Next strips `basePath` internally for the Pages
 * Router: `__BUILD_MANIFEST.sortedPages` holds routes without it.
 */
export function stripBasePath(pathname: string): string {
  const basePath = getBasePath();

  return basePath && pathname.startsWith(basePath) ? pathname.slice(basePath.length) || '/' : pathname;
}

// Specificity ranks for a single route segment, from most to least specific. `END` is the rank of
// the position just past the last segment of a route, so that a route which stops is compared
// against whatever the longer route continues with.
const SEGMENT_STATIC = 0;
const SEGMENT_DYNAMIC = 1;
const SEGMENT_END = 2;
const SEGMENT_CATCH_ALL = 3;
const SEGMENT_OPTIONAL_CATCH_ALL = 4;

/**
 * Calculate the specificity rank for a single route segment.
 * Lower ranks indicate more specific segments.
 */
function getSegmentSpecificity(segment: string | undefined): number {
  if (segment === undefined) {
    // The route has no more segments
    return SEGMENT_END;
  }
  if (!segment.startsWith(':')) {
    // Static segment: matches exactly one known value
    return SEGMENT_STATIC;
  }

  const paramName = segment.substring(1);
  if (paramName.endsWith('*?')) {
    // Optional catch-all: [[...param]]
    return SEGMENT_OPTIONAL_CATCH_ALL;
  }
  if (paramName.endsWith('*')) {
    // Required catch-all: [...param]
    return SEGMENT_CATCH_ALL;
  }
  // Regular dynamic segment: [param]
  return SEGMENT_DYNAMIC;
}

/**
 * Compare two route paths by specificity, ordering the most specific route first.
 *
 * Routes are compared segment by segment, with the first segment they disagree on deciding the
 * winner. Comparing aggregate scores instead would rank a short catch-all like '/:locale/:rest*'
 * above a longer but strictly narrower route like '/:locale/guides/:category/:rest*', because the
 * longer route accumulates more score simply by having more segments.
 *
 * Routes of differing lengths are compared one segment past the shorter one, where `SEGMENT_END`
 * decides whether continuing narrows the route or widens it: '/:locale/foo' is more specific than
 * '/:locale', but '/:locale' is more specific than '/:locale/:rest*'.
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
    // Cache the failure to avoid repeated attempts by storing undefined
    return null;
  }
}

/**
 * Get and cache the route manifest from the global object.
 * @returns The parsed route manifest or null if not available/invalid.
 */
export function getManifest(): RouteManifest | null {
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
    isrRoutes: [],
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

  // Static path: no parameterization needed, return the route itself as already parameterized
  if (staticRoutes.some(r => r.path === route)) {
    return [route];
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

  // Try matching with optional prefix segments (for i18n routing patterns)
  // This handles cases like '/foo' matching '/:locale/foo' when using next-intl with localePrefix: "as-needed"
  // We do this regardless of whether we found direct matches, as we want the most specific match
  if (!route.startsWith('/:')) {
    for (const dynamicRoute of dynamicRoutes) {
      if (dynamicRoute.hasOptionalPrefix && dynamicRoute.regex) {
        // Prepend a placeholder segment to simulate the optional prefix
        // e.g., '/foo' becomes '/PLACEHOLDER/foo' to match '/:locale/foo'
        // Special case: '/' becomes '/PLACEHOLDER' (not '/PLACEHOLDER/') to match '/:locale' pattern
        const routeWithPrefix = route === '/' ? '/SENTRY_OPTIONAL_PREFIX' : `/SENTRY_OPTIONAL_PREFIX${route}`;
        const regex = getCompiledRegex(dynamicRoute.regex);
        if (regex?.test(routeWithPrefix)) {
          matches.push(dynamicRoute.path);
        }
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

  // Normalize trailing slashes to handle `trailingSlash: true` in Next.js config.
  // When trailingSlash is enabled, all URLs get a trailing slash appended (e.g. '/about' becomes '/about/'),
  // but route manifests store paths without trailing slashes. Without normalization, static routes fail
  // exact-match checks and dynamic route regexes don't match, causing all routes to fall through to
  // catch-all patterns. See: https://github.com/getsentry/sentry-javascript/issues/19241
  const normalizedRoute = route.length > 1 && route.endsWith('/') ? route.slice(0, -1) : route;

  // Check route result cache after manifest validation
  if (routeResultCache.has(normalizedRoute)) {
    return routeResultCache.get(normalizedRoute);
  }

  const { staticRoutes, dynamicRoutes } = manifest;
  if (!Array.isArray(staticRoutes) || !Array.isArray(dynamicRoutes)) {
    return undefined;
  }

  const matches = findMatchingRoutes(normalizedRoute, staticRoutes, dynamicRoutes);

  // We can always do the `sort()` call, it will short-circuit when it has one array item
  const result = matches.sort(compareRouteSpecificity)[0];

  routeResultCache.set(normalizedRoute, result);

  return result;
};
