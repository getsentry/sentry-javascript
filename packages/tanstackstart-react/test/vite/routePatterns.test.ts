import { describe, expect, it } from 'vitest';
import { extractRoutePatterns } from '../../src/vite/routePatterns';

describe('extractRoutePatterns', () => {
  it('extracts route patterns from routeTree.gen.ts content', () => {
    const content = `
const PageARoute = PageARouteImport.update({
  id: '/page-a',
  path: '/page-a',
  getParentRoute: () => rootRouteImport,
})
const IndexRoute = IndexRouteImport.update({
  id: '/',
  path: '/',
  getParentRoute: () => rootRouteImport,
})
const PageBIdRoute = PageBIdRouteImport.update({
  id: '/page-b/$id',
  path: '/page-b/$id',
  getParentRoute: () => rootRouteImport,
})
`;
    const patterns = extractRoutePatterns(content);
    expect(patterns).toContain('/page-a');
    expect(patterns).toContain('/page-b/$id');
    expect(patterns).toContain('/');
  });

  it('always includes the root route', () => {
    const patterns = extractRoutePatterns('');
    expect(patterns).toEqual(['/']);
  });

  it('handles nested routes', () => {
    const content = `
const UsersIdRoute = UsersIdRouteImport.update({
  id: '/users/$userId',
  path: '/users/$userId',
})
const UsersIdPostsRoute = UsersIdPostsRouteImport.update({
  id: '/users/$userId/posts/$postId',
  path: '/users/$userId/posts/$postId',
})
`;
    const patterns = extractRoutePatterns(content);
    expect(patterns).toContain('/users/$userId');
    expect(patterns).toContain('/users/$userId/posts/$postId');
  });
});
