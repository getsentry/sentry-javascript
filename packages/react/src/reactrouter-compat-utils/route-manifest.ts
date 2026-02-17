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
    const patternSegmentsWithoutWildcard = patternSegments.slice(0, -1);
    if (pathSegments.length < patternSegmentsWithoutWildcard.length) {
      return false;
    }
    for (const [i, patternSegment] of patternSegmentsWithoutWildcard.entries()) {
      if (!segmentMatches(pathSegments[i], patternSegment)) {
        return false;
      }
    }
    return true;
  }

  // Exact segment count match required
  if (pathSegments.length !== patternSegments.length) {
    return false;
  }

  for (const [i, patternSegment] of patternSegments.entries()) {
    if (!segmentMatches(pathSegments[i], patternSegment)) {
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
  if (PARAM_RE.test(patternSegment)) {
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
 * React Router scoring weights and param detection.
 * https://github.com/remix-run/react-router/blob/main/packages/react-router/lib/router/utils.ts
 */
const PARAM_RE = /^:[\w-]+$/;
const STATIC_SEGMENT_SCORE = 10;
const DYNAMIC_SEGMENT_SCORE = 3;
const EMPTY_SEGMENT_SCORE = 1;
const SPLAT_PENALTY = -2;

/**
 * Computes a specificity score for a route pattern.
 * Matches React Router's computeScore() algorithm exactly.
 */
function computeScore(pattern: string): number {
  const segments = pattern.split('/');

  // Base score is segment count (including empty segment from leading slash)
  let score = segments.length;

  // Apply splat penalty once if pattern contains wildcard
  if (segments.includes('*')) {
    score += SPLAT_PENALTY;
  }

  for (const segment of segments) {
    if (segment === '*') {
      // Splat penalty already applied globally above
      continue;
    } else if (PARAM_RE.test(segment)) {
      score += DYNAMIC_SEGMENT_SCORE;
    } else if (segment === '') {
      score += EMPTY_SEGMENT_SCORE;
    } else {
      score += STATIC_SEGMENT_SCORE;
    }
  }

  return score;
}

/**
 * Sorts route patterns by specificity (most specific first).
 * Implements React Router's ranking algorithm from computeScore():
 * https://github.com/remix-run/react-router/blob/main/packages/react-router/lib/router/utils.ts
 *
 * React Router scoring: base=segments.length, static=+10, dynamic=+3, empty=+1, splat=-2 (once)
 * Higher score = more specific pattern.
 * Equal scores preserve manifest order (same as React Router).
 *
 * Note: Users should order their manifest from most specific to least specific
 * when patterns have equal specificity (e.g., `/users/:id/settings` and `/:type/123/settings`).
 */
function sortBySpecificity(manifest: string[]): string[] {
  return [...manifest].sort((a, b) => {
    const aScore = computeScore(a);
    const bScore = computeScore(b);

    return bScore - aScore;
  });
}
