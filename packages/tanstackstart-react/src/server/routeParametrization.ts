import { ATTR_HTTP_ROUTE } from '@opentelemetry/semantic-conventions';
import {
  escapeStringForRegex,
  getActiveSpan,
  getRootSpan,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  spanToJSON,
  updateSpanName,
} from '@sentry/core';

function patternToRegex(pattern: string): RegExp {
  const segments = pattern
    .split('/')
    .map(segment => {
      if (segment.startsWith('$')) {
        return '[^/]+';
      }
      return escapeStringForRegex(segment);
    })
    .join('/');
  return new RegExp(`^${segments}$`);
}

/**
 * Matches a URL pathname against a list of TanStack Start route patterns.
 * Patterns use `$param` syntax for dynamic segments (e.g., `/users/$id`).
 *
 * Patterns are sorted by specificity: more segments first, static before dynamic.
 */
export function matchUrlToRoutePattern(pathname: string, patterns: string[]): string | undefined {
  const sorted = [...patterns].sort((a, b) => {
    const aSegments = a.split('/');
    const bSegments = b.split('/');
    if (bSegments.length !== aSegments.length) {
      return bSegments.length - aSegments.length;
    }
    const aDynamic = aSegments.filter(s => s.startsWith('$')).length;
    const bDynamic = bSegments.filter(s => s.startsWith('$')).length;
    return aDynamic - bDynamic;
  });

  for (const pattern of sorted) {
    if (patternToRegex(pattern).test(pathname)) {
      return pattern;
    }
  }
  return undefined;
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
  const rootSpanData = spanToJSON(rootSpan).data;
  if (rootSpanData?.[ATTR_HTTP_ROUTE]) {
    return;
  }

  updateSpanName(rootSpan, `${method} ${matchedPattern}`);
  rootSpan.setAttribute(ATTR_HTTP_ROUTE, matchedPattern);
  rootSpan.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'route');
}
