import { SENTRY_SEGMENT_NAME_SOURCE, HTTP_ROUTE } from '@sentry/conventions/attributes';
import {
  escapeStringForRegex,
  getActiveSpan,
  getCurrentScope,
  getRootSpan,
  spanToJSON,
  updateSpanName,
} from '@sentry/core';

const STATIC = 0;
const AFFIXED_PARAM = 1;
const PARAM = 2;
const OPTIONAL_PARAM = 3;
const SPLAT = 4;

// e.g. `@{$groupSlug}`, `sitemap-{$page}.xml`, `{-$locale}`, `{$}`
const BRACED_SEGMENT_REGEX = /^(.*)\{(-?)\$([^}]*)\}(.*)$/;

interface CompiledRoutePattern {
  regex: RegExp;
  // One rank per segment (an index route's trailing slash counts as an empty static segment),
  // used to pick the most specific of several matching patterns.
  ranks: number[];
}

const compiledRoutePatterns = new Map<string, CompiledRoutePattern>();

function compileSegment(segment: string): { source: string; rank: number } {
  if (segment === '') {
    return { source: '', rank: STATIC };
  }

  if (segment === '$') {
    return { source: '(?:/.*)?', rank: SPLAT };
  }

  if (segment.startsWith('$')) {
    return { source: '/[^/]+', rank: PARAM };
  }

  const braced = segment.match(BRACED_SEGMENT_REGEX);
  if (!braced) {
    return { source: `/${escapeStringForRegex(segment)}`, rank: STATIC };
  }

  const [, prefix = '', optional, name, suffix = ''] = braced;
  const hasAffix = !!prefix || !!suffix;
  const escapedPrefix = escapeStringForRegex(prefix);
  const escapedSuffix = escapeStringForRegex(suffix);

  if (!name) {
    return hasAffix
      ? { source: `/${escapedPrefix}.*${escapedSuffix}`, rank: SPLAT }
      : { source: '(?:/.*)?', rank: SPLAT };
  }

  if (optional) {
    return { source: `(?:/${escapedPrefix}[^/]+${escapedSuffix})?`, rank: OPTIONAL_PARAM };
  }

  return hasAffix
    ? { source: `/${escapedPrefix}[^/]*${escapedSuffix}`, rank: AFFIXED_PARAM }
    : { source: '/[^/]+', rank: PARAM };
}

function compileRoutePattern(pattern: string): CompiledRoutePattern {
  const cached = compiledRoutePatterns.get(pattern);
  if (cached) {
    return cached;
  }

  let source = '';
  const ranks: number[] = [];
  for (const segment of pattern.split('/').slice(1)) {
    const compiled = compileSegment(segment);
    source += compiled.source;
    ranks.push(compiled.rank);
  }

  // TanStack Router matches case-insensitively by default.
  const compiledPattern = { regex: new RegExp(`^${source}$`, 'i'), ranks };
  compiledRoutePatterns.set(pattern, compiledPattern);
  return compiledPattern;
}

function isMoreSpecific(a: number[], b: number[]): boolean {
  // Mirrors TanStack Router: the longer pattern wins (an index route over its layout, an optional
  // segment over the same path without it), then the earliest more specific segment.
  if (a.length !== b.length) {
    return a.length > b.length;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return (a[i] as number) < (b[i] as number);
    }
  }
  return false;
}

/**
 * Matches a URL pathname against a list of TanStack Start route patterns (the `fullPaths` of the generated route tree).
 * Supports `$param`, `prefix{$param}suffix`, optional `{-$param}` and splat (`$`, `{$}`) segments, as well as
 * index routes (trailing slash). If several patterns match, the most specific one is returned.
 */
export function matchUrlToRoutePattern(pathname: string, patterns: string[]): string | undefined {
  const normalizedPathname = pathname.replace(/\/$/, '');
  let bestPattern: string | undefined;
  let bestRanks: number[] | undefined;
  for (const pattern of patterns) {
    const { regex, ranks } = compileRoutePattern(pattern);
    if (regex.test(normalizedPathname) && (!bestRanks || isMoreSpecific(ranks, bestRanks))) {
      bestPattern = pattern;
      bestRanks = ranks;
    }
  }
  return bestPattern;
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
