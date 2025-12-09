import type { AgnosticRouteObject } from '@remix-run/router';
import { describe, expect, it } from 'vitest';
import { convertRemixRouteIdToPath, getTransactionName } from '../../src/utils/utils';

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

    it('should handle nested _index routes', () => {
      const routesWithNestedIndex: AgnosticRouteObject[] = [
        {
          id: 'routes/users._index',
          path: '/users',
        },
      ];

      const url = new URL('http://localhost/users');
      const [name, source] = getTransactionName(routesWithNestedIndex, url);

      // Should return /users, not /users/_index
      expect(name).toBe('/users');
      expect(source).toBe('route');
    });
  });
});

describe('convertRemixRouteIdToPath', () => {
  describe('basic routes', () => {
    it('should convert root _index route', () => {
      expect(convertRemixRouteIdToPath('routes/_index')).toBe('/');
    });

    it('should convert root index route', () => {
      expect(convertRemixRouteIdToPath('routes/index')).toBe('/');
    });

    it('should convert static routes', () => {
      expect(convertRemixRouteIdToPath('routes/about')).toBe('/about');
      expect(convertRemixRouteIdToPath('routes/contact')).toBe('/contact');
    });

    it('should convert dynamic routes', () => {
      expect(convertRemixRouteIdToPath('routes/user.$id')).toBe('/user/:id');
      expect(convertRemixRouteIdToPath('routes/blog.$slug')).toBe('/blog/:slug');
    });
  });

  describe('_index route handling', () => {
    it('should handle nested _index routes (flat file convention)', () => {
      // users._index should map to /users, not /users/_index
      expect(convertRemixRouteIdToPath('routes/users._index')).toBe('/users');
    });

    it('should handle deeply nested _index routes', () => {
      expect(convertRemixRouteIdToPath('routes/admin.settings._index')).toBe('/admin/settings');
      expect(convertRemixRouteIdToPath('routes/api.v1.users._index')).toBe('/api/v1/users');
    });

    it('should handle _index with dynamic segments', () => {
      // This represents an index route under a dynamic segment
      expect(convertRemixRouteIdToPath('routes/users.$id._index')).toBe('/users/:id');
    });

    it('should handle _index under pathless layouts', () => {
      // _auth is a pathless layout, _auth._index is its index (maps to /)
      expect(convertRemixRouteIdToPath('routes/_auth._index')).toBe('/');
      // _dashboard.settings._index maps to /settings (skipping _dashboard)
      expect(convertRemixRouteIdToPath('routes/_dashboard.settings._index')).toBe('/settings');
    });

    it('should NOT include _index as a path segment', () => {
      const result = convertRemixRouteIdToPath('routes/users._index');
      expect(result).not.toContain('_index');
    });
  });

  describe('index route handling (non-underscore)', () => {
    it('should handle nested index routes', () => {
      expect(convertRemixRouteIdToPath('routes/users.index')).toBe('/users');
    });

    it('should handle deeply nested index routes', () => {
      expect(convertRemixRouteIdToPath('routes/admin.settings.index')).toBe('/admin/settings');
    });
  });

  describe('layout routes', () => {
    it('should skip pathless layout segments', () => {
      expect(convertRemixRouteIdToPath('routes/_auth.login')).toBe('/login');
      expect(convertRemixRouteIdToPath('routes/_dashboard.settings')).toBe('/settings');
    });

    it('should handle multiple pathless layouts', () => {
      expect(convertRemixRouteIdToPath('routes/_auth._layout.login')).toBe('/login');
    });
  });

  describe('splat routes', () => {
    it('should convert splat routes', () => {
      expect(convertRemixRouteIdToPath('routes/docs.$')).toBe('/docs/:*');
      expect(convertRemixRouteIdToPath('routes/$')).toBe('/:*');
    });
  });

  describe('complex nested routes', () => {
    it('should handle multiple dynamic segments', () => {
      expect(convertRemixRouteIdToPath('routes/users.$userId.posts.$postId')).toBe('/users/:userId/posts/:postId');
    });

    it('should handle mixed static and dynamic segments', () => {
      expect(convertRemixRouteIdToPath('routes/api.v1.users.$id.comments')).toBe('/api/v1/users/:id/comments');
    });
  });
});
