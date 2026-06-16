import { ATTR_HTTP_ROUTE } from '@opentelemetry/semantic-conventions';
import {
  escapeStringForRegex,
  getActiveSpan,
  getCurrentScope,
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
 * Patterns are expected to be pre-sorted by specificity (more segments first, static before dynamic).
 */
export function matchUrlToRoutePattern(pathname: string, patterns: string[]): string | undefined {
  const normalizedPathname = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;
  for (const pattern of patterns) {
    if (patternToRegex(pattern).test(normalizedPathname)) {
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

  const transactionName = `${method} ${matchedPattern}`;
  updateSpanName(rootSpan, transactionName);
  rootSpan.setAttribute(ATTR_HTTP_ROUTE, matchedPattern);
  rootSpan.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'route');
  getCurrentScope().setTransactionName(transactionName);
}
