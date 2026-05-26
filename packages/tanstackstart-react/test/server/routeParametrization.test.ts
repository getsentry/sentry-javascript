import { describe, expect, it } from 'vitest';
import { matchUrlToRoutePattern } from '../../src/server/routeParametrization';

describe('matchUrlToRoutePattern', () => {
  const patterns = ['/', '/page-a', '/page-b/$id', '/users/$userId/posts/$postId', '/api/health'];

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

  it('prefers static over dynamic matches', () => {
    const patternsWithOverlap = ['/page-b/$id', '/page-b/special'];
    expect(matchUrlToRoutePattern('/page-b/special', patternsWithOverlap)).toBe('/page-b/special');
  });

  it('prefers more specific routes (more segments)', () => {
    const patternsNested = ['/users/$id', '/users/$id/profile'];
    expect(matchUrlToRoutePattern('/users/123/profile', patternsNested)).toBe('/users/$id/profile');
  });

  it('matches splat/catch-all routes across multiple segments', () => {
    const patternsWithSplat = ['/', '/files/$'];
    expect(matchUrlToRoutePattern('/files/a/b/c', patternsWithSplat)).toBe('/files/$');
    expect(matchUrlToRoutePattern('/files/readme.txt', patternsWithSplat)).toBe('/files/$');
  });

  it('prefers specific routes over splat routes', () => {
    const patternsWithSplat = ['/files/$', '/files/upload'];
    expect(matchUrlToRoutePattern('/files/upload', patternsWithSplat)).toBe('/files/upload');
    expect(matchUrlToRoutePattern('/files/a/b', patternsWithSplat)).toBe('/files/$');
  });

  it('prefers named param routes over splat routes with same segment count', () => {
    const patternsWithBoth = ['/files/$', '/files/$name'];
    expect(matchUrlToRoutePattern('/files/readme.txt', patternsWithBoth)).toBe('/files/$name');
  });
});
