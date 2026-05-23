import { describe, expect, it } from 'vitest';
import { extractRoutePatterns } from '../../src/vite/routePatterns';

describe('extractRoutePatterns', () => {
  it('extracts full path patterns from single-line fullPaths union', () => {
    const content = `
export interface FileRouteTypes {
  fullPaths: '/' | '/page-a' | '/page-b/$id'
  fileRoutesByTo: FileRoutesByTo
}
`;
    const patterns = extractRoutePatterns(content);
    expect(patterns).toContain('/');
    expect(patterns).toContain('/page-a');
    expect(patterns).toContain('/page-b/$id');
    expect(patterns).toHaveLength(3);
  });

  it('extracts full path patterns from multi-line fullPaths union', () => {
    const content = `
export interface FileRouteTypes {
  fullPaths:
    | '/'
    | '/page-a'
    | '/page-b/$id'
    | '/api/error'
  fileRoutesByTo: FileRoutesByTo
}
`;
    const patterns = extractRoutePatterns(content);
    expect(patterns).toContain('/');
    expect(patterns).toContain('/page-a');
    expect(patterns).toContain('/page-b/$id');
    expect(patterns).toContain('/api/error');
    expect(patterns).toHaveLength(4);
  });

  it('always includes the root route', () => {
    const patterns = extractRoutePatterns('');
    expect(patterns).toEqual(['/']);
  });

  it('extracts nested route full paths correctly', () => {
    const content = `
export interface FileRouteTypes {
  fullPaths:
    | '/'
    | '/users'
    | '/users/$userId'
    | '/users/$userId/posts/$postId'
  fileRoutesByTo: FileRoutesByTo
}
`;
    const patterns = extractRoutePatterns(content);
    expect(patterns).toContain('/users');
    expect(patterns).toContain('/users/$userId');
    expect(patterns).toContain('/users/$userId/posts/$postId');
  });

  it('deduplicates patterns', () => {
    const content = `
export interface FileRouteTypes {
  fullPaths: '/' | '/page-a' | '/page-a'
  fileRoutesByTo: FileRoutesByTo
}
`;
    const patterns = extractRoutePatterns(content);
    expect(patterns.filter(p => p === '/page-a')).toHaveLength(1);
  });
});
