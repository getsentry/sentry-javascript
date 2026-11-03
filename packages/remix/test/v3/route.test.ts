import { createMultiMatcher } from '@remix-run/route-pattern/match';
import { RoutePattern } from '@remix-run/route-pattern';
import { describe, expect, it } from 'vitest';

import { resolveRoutePattern } from '../../src/v3/server/route';
import type { MatcherLike, RequestContextLike } from '../../src/v3/types';

/**
 * Built with the real matcher rather than a stub, because what is being tested is that the SDK reads
 * the same shape the router stores and applies the same selection rules.
 */
function matcherWith(routes: Array<[method: string, pattern: string]>): MatcherLike {
  const matcher = createMultiMatcher();

  for (const [method, source] of routes) {
    const pattern = RoutePattern.parse(source);
    matcher.add(pattern, { pattern, method });
  }

  return matcher as unknown as MatcherLike;
}

function contextFor(method: string, url: string): RequestContextLike {
  return { request: new Request(url, { method }), url: new URL(url), method, params: {} };
}

describe('resolveRoutePattern', () => {
  it('returns the pattern rather than the concrete path', () => {
    const matcher = matcherWith([['GET', '/users/:id']]);

    expect(resolveRoutePattern(matcher, contextFor('GET', 'http://x/users/12345'))).toBe('/users/:id');
  });

  it('returns the prefixed pattern for a mounted route', () => {
    // `router.mount()` applies its prefix when the route is registered, so a mounted route is already
    // stored under its full pattern.
    const matcher = matcherWith([['GET', '/api/items/:itemId']]);

    expect(resolveRoutePattern(matcher, contextFor('GET', 'http://x/api/items/abc'))).toBe('/api/items/:itemId');
  });

  it('skips a route whose method does not match', () => {
    // The more specific POST route is matched first, so a resolver that ignored the method would
    // return it instead of the GET route the router would actually dispatch to.
    const matcher = matcherWith([
      ['POST', '/things'],
      ['GET', '/*rest'],
    ]);

    expect(resolveRoutePattern(matcher, contextFor('GET', 'http://x/things'))).toBe('/*rest');
  });

  it('treats an ANY route as a match for every method', () => {
    const matcher = matcherWith([['ANY', '/anything']]);

    expect(resolveRoutePattern(matcher, contextFor('DELETE', 'http://x/anything'))).toBe('/anything');
  });

  it('falls back to a GET route for a HEAD request, as the router does', () => {
    const matcher = matcherWith([['GET', '/page']]);

    expect(resolveRoutePattern(matcher, contextFor('HEAD', 'http://x/page'))).toBe('/page');
  });

  it('returns undefined when nothing matches, so the name is left alone', () => {
    const matcher = matcherWith([['GET', '/users/:id']]);

    expect(resolveRoutePattern(matcher, contextFor('GET', 'http://x/nope'))).toBeUndefined();
  });

  it('returns undefined when the matcher throws', () => {
    const broken: MatcherLike = {
      add: () => {},
      matchAll: () => {
        throw new Error('mismatched route-pattern copy');
      },
    };

    expect(resolveRoutePattern(broken, contextFor('GET', 'http://x/users/1'))).toBeUndefined();
  });
});
