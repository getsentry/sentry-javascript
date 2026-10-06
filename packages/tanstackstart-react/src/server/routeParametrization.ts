import { SENTRY_SEGMENT_NAME_SOURCE, HTTP_ROUTE } from '@sentry/conventions/attributes';
import { getActiveSpan, getCurrentScope, getRootSpan, spanToJSON, updateSpanName } from '@sentry/core';

type RouteSegment =
  | { kind: 'static'; value: string }
  | { kind: 'param' | 'optional' | 'splat'; prefix: string; suffix: string };

interface ParsedRoutePattern {
  segments: RouteSegment[];
  isIndex: boolean;
  affixLength: number;
}

interface MatchScore {
  statics: number;
  dynamics: number;
  optionals: number;
}

// e.g. `@{$groupSlug}`, `sitemap-{$page}.xml`, `{-$locale}`, `{$}`
const BRACED_SEGMENT_REGEX = /^(.*?)\{(-?)\$([^}]*)\}(.*)$/;

const parsedRoutePatterns = new Map<string, ParsedRoutePattern>();

function parseRoutePattern(pattern: string): ParsedRoutePattern {
  const cached = parsedRoutePatterns.get(pattern);
  if (cached) {
    return cached;
  }

  const parts = pattern.split('/').filter(Boolean);
  const segments: RouteSegment[] = [];
  let affixLength = 0;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i] as string;
    const braced = part.match(BRACED_SEGMENT_REGEX);
    if (part === '$' || (braced && !braced[3] && !braced[2])) {
      // A splat consumes the rest of the path, so anything after it in the pattern is part of its suffix.
      const rest = parts.slice(i + 1).join('/');
      const prefix = braced?.[1] ?? '';
      const suffix = (braced?.[4] ?? '') + (rest ? `/${rest}` : '');
      segments.push({ kind: 'splat', prefix: prefix.toLowerCase(), suffix: suffix.toLowerCase() });
      affixLength += prefix.length + suffix.length;
      break;
    }
    if (part.startsWith('$')) {
      segments.push({ kind: 'param', prefix: '', suffix: '' });
    } else if (braced?.[3]) {
      const [, prefix = '', optional, , suffix = ''] = braced;
      segments.push({
        kind: optional ? 'optional' : 'param',
        prefix: prefix.toLowerCase(),
        suffix: suffix.toLowerCase(),
      });
      affixLength += prefix.length + suffix.length;
    } else {
      segments.push({ kind: 'static', value: part.toLowerCase() });
    }
  }

  const parsed = { segments, isIndex: pattern.endsWith('/'), affixLength };
  parsedRoutePatterns.set(pattern, parsed);
  return parsed;
}

function hasAffixes(value: string, prefix: string, suffix: string): boolean {
  return value.startsWith(prefix) && value.endsWith(suffix) && value.length >= prefix.length + suffix.length;
}

function isBetterScore(a: MatchScore, b: MatchScore): boolean {
  if (a.statics !== b.statics) {
    return a.statics > b.statics;
  }
  if (a.dynamics !== b.dynamics) {
    return a.dynamics > b.dynamics;
  }
  return a.optionals > b.optionals;
}

/**
 * Returns the best score with which `segments` match the remaining path `parts`, or `undefined` if they don't match.
 * Like TanStack Router, a path part matched by a static, param or optional segment adds to the respective score,
 * weighted so that earlier parts outweigh all later ones.
 */
function scoreMatch(
  segments: RouteSegment[],
  parts: string[],
  si: number,
  pi: number,
  score: MatchScore,
): MatchScore | undefined {
  const segment = segments[si];
  if (!segment) {
    return pi === parts.length ? score : undefined;
  }

  const part = parts[pi];
  const weight = 2 ** (parts.length - pi - 1);

  switch (segment.kind) {
    case 'static':
      return part === segment.value
        ? scoreMatch(segments, parts, si + 1, pi + 1, { ...score, statics: score.statics + weight })
        : undefined;
    case 'param':
      return part !== undefined && hasAffixes(part, segment.prefix, segment.suffix)
        ? scoreMatch(segments, parts, si + 1, pi + 1, { ...score, dynamics: score.dynamics + weight })
        : undefined;
    case 'optional': {
      const skipped = scoreMatch(segments, parts, si + 1, pi, score);
      const consumed =
        part !== undefined && hasAffixes(part, segment.prefix, segment.suffix)
          ? scoreMatch(segments, parts, si + 1, pi + 1, { ...score, optionals: score.optionals + weight })
          : undefined;
      if (!skipped || !consumed) {
        return skipped || consumed;
      }
      return isBetterScore(consumed, skipped) ? consumed : skipped;
    }
    case 'splat': {
      if (!segment.prefix && !segment.suffix) {
        return score;
      }
      return part !== undefined && hasAffixes(parts.slice(pi).join('/'), segment.prefix, segment.suffix)
        ? score
        : undefined;
    }
  }
}

function isMoreSpecific(
  a: { score: MatchScore; route: ParsedRoutePattern },
  b: { score: MatchScore; route: ParsedRoutePattern },
): boolean {
  if (
    a.score.statics !== b.score.statics ||
    a.score.dynamics !== b.score.dynamics ||
    a.score.optionals !== b.score.optionals
  ) {
    return isBetterScore(a.score, b.score);
  }
  if (a.route.isIndex !== b.route.isIndex) {
    return a.route.isIndex;
  }
  if (a.route.segments.length !== b.route.segments.length) {
    return a.route.segments.length > b.route.segments.length;
  }
  return a.route.affixLength > b.route.affixLength;
}

/**
 * Matches a URL pathname against a list of TanStack Start route patterns (the `fullPaths` of the generated route tree).
 * Supports `$param`, `prefix{$param}suffix`, optional `{-$param}` and splat (`$`, `{$}`) segments, as well as
 * index routes (trailing slash). If several patterns match, the most specific one is picked the way TanStack Router
 * picks it.
 */
export function matchUrlToRoutePattern(pathname: string, patterns: string[]): string | undefined {
  if (pathname === '/' && patterns.includes('/')) {
    return '/';
  }

  // TanStack Router matches case-insensitively by default.
  const parts = pathname.toLowerCase().split('/').filter(Boolean);
  let best: { pattern: string; score: MatchScore; route: ParsedRoutePattern } | undefined;
  for (const pattern of patterns) {
    const route = parseRoutePattern(pattern);
    const score = scoreMatch(route.segments, parts, 0, 0, { statics: 0, dynamics: 0, optionals: 0 });
    if (score && (!best || isMoreSpecific({ score, route }, best))) {
      best = { pattern, score, route };
    }
  }
  return best?.pattern;
}

/**
 * Updates the active root span with a parametrized route name.
 */
export function updateSpanWithRouteParametrization(method: string, pathname: string, patterns: string[]): void {
  const matchedPattern = matchUrlToRoutePattern(pathname, patterns);
  if (!matchedPattern) {
    return;
  }

  const activeSpan = getActiveSpan();
  if (!activeSpan) {
    return;
  }

  const rootSpan = getRootSpan(activeSpan);
  const rootSpanData = spanToJSON(rootSpan).attributes;
  if (rootSpanData?.[HTTP_ROUTE]) {
    return;
  }

  const transactionName = `${method} ${matchedPattern}`;
  updateSpanName(rootSpan, transactionName);
  rootSpan.setAttribute(HTTP_ROUTE, matchedPattern);
  rootSpan.setAttribute(SENTRY_SEGMENT_NAME_SOURCE, 'route');
  getCurrentScope().setTransactionName(transactionName);
}
