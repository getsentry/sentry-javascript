import { describe, expect, it } from 'vitest';
import { matchUrlToRoutePattern } from '../../src/server/routeParametrization';

describe('matchUrlToRoutePattern', () => {
  // Pre-sorted by specificity: more segments first, static before dynamic
  const patterns = ['/users/$userId/posts/$postId', '/api/health', '/page-a', '/page-b/$id', '/'];

  it('matches the root route', () => {
    expect(matchUrlToRoutePattern('/', patterns)).toBe('/');
  });

  it('matches a static route', () => {
    expect(matchUrlToRoutePattern('/page-a', patterns)).toBe('/page-a');
  });

  it('matches a single-param route', () => {
    expect(matchUrlToRoutePattern('/page-b/42', patterns)).toBe('/page-b/$id');
  });

  it('matches a multi-param route', () => {
    expect(matchUrlToRoutePattern('/users/123/posts/456', patterns)).toBe('/users/$userId/posts/$postId');
  });

  it('returns undefined for unmatched paths', () => {
    expect(matchUrlToRoutePattern('/unknown', patterns)).toBeUndefined();
  });

  it('returns undefined for partially matched paths', () => {
    expect(matchUrlToRoutePattern('/page-b', patterns)).toBeUndefined();
  });

  it('prefers static over dynamic matches when pre-sorted', () => {
    const patternsWithOverlap = ['/page-b/special', '/page-b/$id'];
    expect(matchUrlToRoutePattern('/page-b/special', patternsWithOverlap)).toBe('/page-b/special');
  });

  it('prefers more specific routes when pre-sorted', () => {
    const patternsNested = ['/users/$id/profile', '/users/$id'];
    expect(matchUrlToRoutePattern('/users/123/profile', patternsNested)).toBe('/users/$id/profile');
  });
});
