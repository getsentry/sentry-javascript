import { describe, expect, it } from 'vitest';
import type { RouteManifest } from '../../../src/config/manifest/types';
import type { SentryBuildOptions } from '../../../src/config/types';

type RouteManifestInjectionOptions = Exclude<SentryBuildOptions['routeManifestInjection'], false | undefined>;
type ExcludeFilter = RouteManifestInjectionOptions['exclude'];

// Inline the filtering logic for unit testing
// This mirrors what maybeCreateRouteManifest does internally
function filterManifest(manifest: RouteManifest, excludeFilter: ExcludeFilter): RouteManifest {
  if (!excludeFilter) {
    return manifest;
  }

  const shouldExclude = (route: string): boolean => {
    if (typeof excludeFilter === 'function') {
      return excludeFilter(route);
    }

    return excludeFilter.some((pattern: string | RegExp) => {
      if (typeof pattern === 'string') {
        return route === pattern;
      }
      return pattern.test(route);
    });
  };

  return {
    staticRoutes: manifest.staticRoutes.filter(r => !shouldExclude(r.path)),
    dynamicRoutes: manifest.dynamicRoutes.filter(r => !shouldExclude(r.path)),
    isrRoutes: manifest.isrRoutes.filter(r => !shouldExclude(r)),
  };
}

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
      const result = filterManifest(mockManifest, undefined);
      expect(result).toEqual(mockManifest);
    });
  });

  describe('with string patterns', () => {
    it('should exclude exact string matches', () => {
      const result = filterManifest(mockManifest, ['/admin']);

      expect(result.staticRoutes.map(r => r.path)).toEqual([
        '/',
        '/about',
        '/admin/dashboard', // Not excluded - not exact match
        '/internal/secret',
        '/public/page',
      ]);
    });

    it('should exclude multiple exact matches', () => {
      const result = filterManifest(mockManifest, ['/admin', '/about', '/blog']);

      expect(result.staticRoutes.map(r => r.path)).toEqual([
        '/',
        '/admin/dashboard',
        '/internal/secret',
        '/public/page',
      ]);
      expect(result.isrRoutes).toEqual(['/admin/reports', '/internal/stats']);
    });
  });

  describe('with regex patterns', () => {
    it('should exclude routes matching regex', () => {
      const result = filterManifest(mockManifest, [/^\/admin/]);

      expect(result.staticRoutes.map(r => r.path)).toEqual(['/', '/about', '/internal/secret', '/public/page']);
      expect(result.dynamicRoutes.map(r => r.path)).toEqual(['/users/:id', '/secret-feature/:id']);
      expect(result.isrRoutes).toEqual(['/blog', '/internal/stats']);
    });

    it('should support multiple regex patterns', () => {
      const result = filterManifest(mockManifest, [/^\/admin/, /^\/internal/]);

      expect(result.staticRoutes.map(r => r.path)).toEqual(['/', '/about', '/public/page']);
      expect(result.isrRoutes).toEqual(['/blog']);
    });

    it('should support partial regex matches', () => {
      const result = filterManifest(mockManifest, [/secret/]);

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

  describe('with mixed patterns', () => {
    it('should support both strings and regex', () => {
      const result = filterManifest(mockManifest, ['/about', /^\/admin/]);

      expect(result.staticRoutes.map(r => r.path)).toEqual(['/', '/internal/secret', '/public/page']);
    });
  });

  describe('with function filter', () => {
    it('should exclude routes where function returns true', () => {
      const result = filterManifest(mockManifest, (route: string) => route.includes('admin'));

      expect(result.staticRoutes.map(r => r.path)).toEqual(['/', '/about', '/internal/secret', '/public/page']);
      expect(result.dynamicRoutes.map(r => r.path)).toEqual(['/users/:id', '/secret-feature/:id']);
      expect(result.isrRoutes).toEqual(['/blog', '/internal/stats']);
    });

    it('should support complex filter logic', () => {
      const result = filterManifest(mockManifest, (route: string) => {
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

      const result = filterManifest(emptyManifest, [/admin/]);
      expect(result).toEqual(emptyManifest);
    });

    it('should handle filter that excludes everything', () => {
      const result = filterManifest(mockManifest, () => true);

      expect(result.staticRoutes).toEqual([]);
      expect(result.dynamicRoutes).toEqual([]);
      expect(result.isrRoutes).toEqual([]);
    });

    it('should handle filter that excludes nothing', () => {
      const result = filterManifest(mockManifest, () => false);
      expect(result).toEqual(mockManifest);
    });

    it('should handle empty filter array', () => {
      const result = filterManifest(mockManifest, []);
      expect(result).toEqual(mockManifest);
    });
  });
});
