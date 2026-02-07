import { debug } from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build';

/**
 * Strip the basename from a pathname if exists.
 *
 * Vendored and modified from `react-router`
 * https://github.com/remix-run/react-router/blob/462bb712156a3f739d6139a0f14810b76b002df6/packages/router/utils.ts#L1038
 */
export function stripBasenameFromPathname(pathname: string, basename: string): string {
  if (!basename || basename === '/') {
    return pathname;
  }

  if (!pathname.toLowerCase().startsWith(basename.toLowerCase())) {
    return pathname;
  }

  // We want to leave trailing slash behavior in the user's control, so if they
  // specify a basename with a trailing slash, we should support it
  const startIndex = basename.endsWith('/') ? basename.length - 1 : basename.length;
  const nextChar = pathname.charAt(startIndex);
  if (nextChar && nextChar !== '/') {
    // pathname does not start with basename/
    return pathname;
  }

  return pathname.slice(startIndex) || '/';
}

// Cache for sorted manifests - keyed by manifest array reference
const SORTED_MANIFEST_CACHE = new WeakMap<string[], string[]>();

/**
 * Matches a pathname against a route manifest and returns the matching pattern.
 * Optionally strips a basename prefix before matching.
 */
export function matchRouteManifest(pathname: string, manifest: string[], basename?: string): string | null {
  if (!pathname || !manifest || !manifest.length) {
    return null;
  }

  const normalizedPathname = basename ? stripBasenameFromPathname(pathname, basename) : pathname;

  let sorted = SORTED_MANIFEST_CACHE.get(manifest);
  if (!sorted) {
    sorted = sortBySpecificity(manifest);
    SORTED_MANIFEST_CACHE.set(manifest, sorted);
    DEBUG_BUILD && debug.log('[React Router] Sorted route manifest by specificity:', sorted.length, 'patterns');
  }

  for (const pattern of sorted) {
    if (matchesPattern(normalizedPathname, pattern)) {
      DEBUG_BUILD && debug.log('[React Router] Matched pathname', normalizedPathname, 'to pattern', pattern);
      return pattern;
    }
  }

  DEBUG_BUILD && debug.log('[React Router] No manifest match found for pathname:', normalizedPathname);
  return null;
}

/**
 * Checks if a pathname matches a route pattern.
 */
function matchesPattern(pathname: string, pattern: string): boolean {
  // Handle root path special case
  if (pattern === '/') {
    return pathname === '/' || pathname === '';
  }

  const pathSegments = splitPath(pathname);
  const patternSegments = splitPath(pattern);

  // Handle wildcard at end
  const hasWildcard = patternSegments.length > 0 && patternSegments[patternSegments.length - 1] === '*';

  if (hasWildcard) {
    // Pattern with wildcard: path must have at least as many segments as pattern (minus wildcard)
    const patternSegmentsWithoutWildcard = patternSegments.length - 1;
    if (pathSegments.length < patternSegmentsWithoutWildcard) {
      return false;
    }
    for (let i = 0; i < patternSegmentsWithoutWildcard; i++) {
      if (!segmentMatches(pathSegments[i], patternSegments[i])) {
        return false;
      }
    }
    return true;
  }

  // Exact segment count match required
  if (pathSegments.length !== patternSegments.length) {
    return false;
  }

  for (let i = 0; i < patternSegments.length; i++) {
    if (!segmentMatches(pathSegments[i], patternSegments[i])) {
      return false;
    }
  }

  return true;
}

/**
 * Checks if a path segment matches a pattern segment.
 */
function segmentMatches(pathSegment: string | undefined, patternSegment: string | undefined): boolean {
  if (pathSegment === undefined || patternSegment === undefined) {
    return false;
  }
  // Parameter matches anything
  if (patternSegment.startsWith(':')) {
    return true;
  }
  // Literal must match exactly
  return pathSegment === patternSegment;
}

/**
 * Splits a path into segments, filtering out empty strings.
 */
function splitPath(path: string): string[] {
  return path.split('/').filter(Boolean);
}

/**
 * Sorts route patterns by specificity (most specific first).
 * Mimics React Router's ranking algorithm from computeScore():
 * https://github.com/remix-run/react-router/blob/main/packages/react-router/lib/router/utils.ts
 *
 * React Router scoring: static=10, dynamic=3, splat=-2 penalty, index=+2 bonus
 * Our simplified approach produces equivalent ordering:
 * - Non-wildcard patterns are more specific than wildcard patterns
 * - More segments = more specific
 * - Among same-length patterns, more literal segments = more specific
 * - Equal specificity: preserves manifest order (same as React Router)
 *
 * Note: Users should order their manifest from most specific to least specific
 * when patterns have equal specificity (e.g., `/users/:id/settings` and `/:type/123/settings`).
 */
function sortBySpecificity(manifest: string[]): string[] {
  return [...manifest].sort((a, b) => {
    const aSegments = splitPath(a);
    const bSegments = splitPath(b);
    const aHasWildcard = aSegments.length > 0 && aSegments[aSegments.length - 1] === '*';
    const bHasWildcard = bSegments.length > 0 && bSegments[bSegments.length - 1] === '*';

    // Non-wildcard patterns are more specific than wildcard patterns
    if (aHasWildcard !== bHasWildcard) {
      return aHasWildcard ? 1 : -1;
    }

    // For comparison, exclude wildcard from segment count
    const aLen = aHasWildcard ? aSegments.length - 1 : aSegments.length;
    const bLen = bHasWildcard ? bSegments.length - 1 : bSegments.length;

    // More segments = more specific
    if (aLen !== bLen) {
      return bLen - aLen;
    }

    // Same length: count literal segments (non-params, non-wildcards)
    const aLiterals = aSegments.filter(s => !s.startsWith(':') && s !== '*').length;
    const bLiterals = bSegments.filter(s => !s.startsWith(':') && s !== '*').length;

    // More literals = more specific (equal specificity preserves original order)
    return bLiterals - aLiterals;
  });
}
