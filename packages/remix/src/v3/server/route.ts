import type { MatcherLike, RequestContextLike } from '../types';

/**
 * Resolve the low cardinality route pattern for a request.
 *
 * The request context never carries the matched pattern: the router matches after its middleware is
 * entered, and only writes `params` back. So this re-runs the match against the router's own matcher,
 * applying the router's own selection rules.
 */
export function resolveRoutePattern(matcher: MatcherLike, context: RequestContextLike): string | undefined {
  let matches;
  try {
    matches = matcher.matchAll(context.url);
  } catch {
    // A matcher from a mismatched `@remix-run/route-pattern` copy can throw on a shape it does not
    // recognise. Losing the route name is not worth failing the request over.
    return undefined;
  }

  let headFallback: string | undefined;

  for (const match of matches) {
    const method = match.data?.method;

    if (method === context.method || method === 'ANY') {
      return match.data?.pattern?.source;
    }

    // A GET route also serves HEAD. The router compares specificity to pick between several; for a
    // span name either pattern is equally correct, so the first one wins here.
    if (context.method === 'HEAD' && method === 'GET') {
      headFallback ??= match.data?.pattern?.source;
    }
  }

  return headFallback;
}
