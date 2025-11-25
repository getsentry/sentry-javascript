import type { AgnosticRouteObject } from '@remix-run/router';
import { describe, expect, it } from 'vitest';
import { getTransactionName } from '../../src/utils/utils';

describe('getTransactionName', () => {
  const mockRoutes: AgnosticRouteObject[] = [
    {
      id: 'routes/_index',
      path: '/',
    },
    {
      id: 'routes/user.$id',
      path: '/user/:id',
    },
    {
      id: 'routes/blog.$slug',
      path: '/blog/:slug',
    },
  ];

  describe('route parameterization', () => {
    it('should return parameterized path for matched dynamic routes', () => {
      const url = new URL('http://localhost/user/123');
      const [name, source] = getTransactionName(mockRoutes, url);

      // Server-side always converts route ID to parameterized path
      expect(name).toBe('/user/:id');
      expect(source).toBe('route');
    });

    it('should return parameterized path for index routes', () => {
      const url = new URL('http://localhost/');
      const [name, source] = getTransactionName(mockRoutes, url);

      // Server-side always converts route ID to parameterized path
      expect(name).toBe('/');
      expect(source).toBe('route');
    });

    it('should return URL pathname for unmatched routes', () => {
      const url = new URL('http://localhost/unknown');
      const [name, source] = getTransactionName(mockRoutes, url);

      expect(name).toBe('/unknown');
      expect(source).toBe('url');
    });

    it('should handle routes with multiple dynamic segments', () => {
      const routesWithNested: AgnosticRouteObject[] = [
        {
          id: 'routes/users.$userId.posts.$postId',
          path: '/users/:userId/posts/:postId',
        },
      ];

      const url = new URL('http://localhost/users/123/posts/456');
      const [name, source] = getTransactionName(routesWithNested, url);

      expect(name).toBe('/users/:userId/posts/:postId');
      expect(source).toBe('route');
    });

    it('should handle splat routes', () => {
      const routesWithSplat: AgnosticRouteObject[] = [
        {
          id: 'routes/docs.$',
          path: '/docs/*',
        },
      ];

      const url = new URL('http://localhost/docs/api/reference/intro');
      const [name, source] = getTransactionName(routesWithSplat, url);

      expect(name).toBe('/docs/:*');
      expect(source).toBe('route');
    });
  });
});
