import { describe, expect, it } from 'vitest';
import type { RouteManifest } from '../../../src/config/manifest/types';
import { filterRouteManifest } from '../../../src/config/withSentryConfig/getFinalConfigObjectUtils';

describe('routeManifestInjection.exclude', () => {
  const mockManifest: RouteManifest = {
    staticRoutes: [
      { path: '/' },
      { path: '/about' },
      { path: '/admin' },
      { path: '/admin/dashboard' },
      { path: '/internal/secret' },
      { path: '/public/page' },
    ],
    dynamicRoutes: [
      { path: '/users/:id', regex: '^/users/([^/]+)$', paramNames: ['id'] },
      { path: '/admin/users/:id', regex: '^/admin/users/([^/]+)$', paramNames: ['id'] },
      { path: '/secret-feature/:id', regex: '^/secret-feature/([^/]+)$', paramNames: ['id'] },
    ],
    isrRoutes: ['/blog', '/admin/reports', '/internal/stats'],
  };

  describe('with no filter', () => {
    it('should return manifest unchanged', () => {
      const result = filterRouteManifest(mockManifest, undefined);
      expect(result).toEqual(mockManifest);
    });
  });

  describe('with string patterns', () => {
    it('should exclude routes containing the string pattern (substring match)', () => {
      const result = filterRouteManifest(mockManifest, ['/admin']);

      // All routes containing '/admin' are excluded
      expect(result.staticRoutes.map(r => r.path)).toEqual(['/', '/about', '/internal/secret', '/public/page']);
      expect(result.dynamicRoutes.map(r => r.path)).toEqual(['/users/:id', '/secret-feature/:id']);
      expect(result.isrRoutes).toEqual(['/blog', '/internal/stats']);
    });

    it('should exclude routes matching multiple string patterns', () => {
      const result = filterRouteManifest(mockManifest, ['/about', '/blog']);

      expect(result.staticRoutes.map(r => r.path)).toEqual([
        '/',
        '/admin',
        '/admin/dashboard',
        '/internal/secret',
        '/public/page',
      ]);
      expect(result.isrRoutes).toEqual(['/admin/reports', '/internal/stats']);
    });

    it('should match substrings anywhere in the route', () => {
      // 'secret' matches '/internal/secret' and '/secret-feature/:id'
      const result = filterRouteManifest(mockManifest, ['secret']);

      expect(result.staticRoutes.map(r => r.path)).toEqual([
        '/',
        '/about',
        '/admin',
        '/admin/dashboard',
        '/public/page',
      ]);
      expect(result.dynamicRoutes.map(r => r.path)).toEqual(['/users/:id', '/admin/users/:id']);
    });
  });

  describe('with regex patterns', () => {
    it('should exclude routes matching regex', () => {
      const result = filterRouteManifest(mockManifest, [/^\/admin/]);

      expect(result.staticRoutes.map(r => r.path)).toEqual(['/', '/about', '/internal/secret', '/public/page']);
      expect(result.dynamicRoutes.map(r => r.path)).toEqual(['/users/:id', '/secret-feature/:id']);
      expect(result.isrRoutes).toEqual(['/blog', '/internal/stats']);
    });

    it('should support multiple regex patterns', () => {
      const result = filterRouteManifest(mockManifest, [/^\/admin/, /^\/internal/]);

      expect(result.staticRoutes.map(r => r.path)).toEqual(['/', '/about', '/public/page']);
      expect(result.isrRoutes).toEqual(['/blog']);
    });

    it('should support partial regex matches', () => {
      const result = filterRouteManifest(mockManifest, [/secret/]);

      expect(result.staticRoutes.map(r => r.path)).toEqual([
        '/',
        '/about',
        '/admin',
        '/admin/dashboard',
        '/public/page',
      ]);
      expect(result.dynamicRoutes.map(r => r.path)).toEqual(['/users/:id', '/admin/users/:id']);
    });

    it('should handle case-insensitive regex', () => {
      const result = filterRouteManifest(mockManifest, [/ADMIN/i]);

      expect(result.staticRoutes.map(r => r.path)).toEqual(['/', '/about', '/internal/secret', '/public/page']);
      expect(result.dynamicRoutes.map(r => r.path)).toEqual(['/users/:id', '/secret-feature/:id']);
    });
  });

  describe('with mixed patterns', () => {
    it('should support both strings and regex', () => {
      const result = filterRouteManifest(mockManifest, ['/about', /^\/admin/]);

      expect(result.staticRoutes.map(r => r.path)).toEqual(['/', '/internal/secret', '/public/page']);
    });
  });

  describe('with function filter', () => {
    it('should exclude routes where function returns true', () => {
      const result = filterRouteManifest(mockManifest, (route: string) => route.includes('admin'));

      expect(result.staticRoutes.map(r => r.path)).toEqual(['/', '/about', '/internal/secret', '/public/page']);
      expect(result.dynamicRoutes.map(r => r.path)).toEqual(['/users/:id', '/secret-feature/:id']);
      expect(result.isrRoutes).toEqual(['/blog', '/internal/stats']);
    });

    it('should support complex filter logic', () => {
      const result = filterRouteManifest(mockManifest, (route: string) => {
        // Exclude anything with "secret" or "internal" or admin routes
        return route.includes('secret') || route.includes('internal') || route.startsWith('/admin');
      });

      expect(result.staticRoutes.map(r => r.path)).toEqual(['/', '/about', '/public/page']);
      expect(result.dynamicRoutes.map(r => r.path)).toEqual(['/users/:id']);
      expect(result.isrRoutes).toEqual(['/blog']);
    });
  });

  describe('edge cases', () => {
    it('should handle empty manifest', () => {
      const emptyManifest: RouteManifest = {
        staticRoutes: [],
        dynamicRoutes: [],
        isrRoutes: [],
      };

      const result = filterRouteManifest(emptyManifest, [/admin/]);
      expect(result).toEqual(emptyManifest);
    });

    it('should handle filter that excludes everything', () => {
      const result = filterRouteManifest(mockManifest, () => true);

      expect(result.staticRoutes).toEqual([]);
      expect(result.dynamicRoutes).toEqual([]);
      expect(result.isrRoutes).toEqual([]);
    });

    it('should handle filter that excludes nothing', () => {
      const result = filterRouteManifest(mockManifest, () => false);
      expect(result).toEqual(mockManifest);
    });

    it('should handle empty filter array', () => {
      const result = filterRouteManifest(mockManifest, []);
      expect(result).toEqual(mockManifest);
    });
  });
});
