import type { NuxtPage } from 'nuxt/schema';
import { describe, expect, it } from 'vitest';
import { extractParametrizedRouteFromContext } from '../../../src/runtime/utils/route-extraction';

describe('extractParametrizedRouteFromContext', () => {
  const createMockRouteData = (overrides: Partial<NuxtPage> = {}): NuxtPage => ({
    name: '',
    path: '',
    file: '',
    children: [],
    ...overrides,
  });

  describe('edge cases', () => {
    it('should return null when ssrContextModules is null', () => {
      const result = extractParametrizedRouteFromContext(null as any, '/test', []);
      expect(result).toBe(null);
    });

    it('should return null when currentUrl is null', () => {
      const modules = new Set(['pages/test.vue']);
      const result = extractParametrizedRouteFromContext(modules, null as any, []);
      expect(result).toBe(null);
    });

    it('should return null when currentUrl is undefined', () => {
      const modules = new Set(['pages/test.vue']);
      const result = extractParametrizedRouteFromContext(modules, undefined as any, []);
      expect(result).toBe(null);
    });

    it('should return null when buildTimePagesData is empty', () => {
      const modules = new Set(['pages/test.vue']);
      const result = extractParametrizedRouteFromContext(modules, '/test', []);
      expect(result).toEqual(null);
    });

    it('should return null when buildTimePagesData has no valid files', () => {
      const modules = new Set(['pages/test.vue']);
      const buildTimePagesData = [
        createMockRouteData({ name: 'test', path: '/test', file: undefined }),
        createMockRouteData({ name: 'about', path: '/about', file: null as any }),
      ];
      const result = extractParametrizedRouteFromContext(modules, '/test', buildTimePagesData);
      expect(result).toEqual(null);
    });
  });

  describe('basic route matching', () => {
    it.each([
      {
        description: 'basic page route',
        modules: new Set(['app.vue', 'pages/home.vue', 'components/Button.vue']),
        currentUrl: '/home',
        buildTimePagesData: [
          createMockRouteData({
            name: 'home',
            path: '/home',
            file: '/app/pages/home.vue',
          }),
        ],
        expected: {
          parametrizedRoute: '/home',
        },
      },
      {
        description: 'nested route',
        modules: new Set(['app.vue', 'pages/user/profile.vue']),
        currentUrl: '/user/profile',
        buildTimePagesData: [
          createMockRouteData({
            name: 'user-profile',
            path: '/user/profile',
            file: '/app/pages/user/profile.vue',
          }),
        ],
        expected: { parametrizedRoute: '/user/profile' },
      },
      {
        description: 'dynamic route with brackets',
        modules: new Set(['app.vue', 'pages/test-param/[param].vue']),
        currentUrl: '/test-param/123',
        buildTimePagesData: [
          createMockRouteData({
            name: 'test-param-param',
            path: '/test-param/:param()',
            file: '/app/pages/test-param/[param].vue',
          }),
        ],
        expected: { parametrizedRoute: '/test-param/:param()' },
      },
      {
        description: 'nested dynamic route',
        modules: new Set(['app.vue', 'pages/test-param/user/[userId].vue']),
        currentUrl: '/test-param/user/456',
        buildTimePagesData: [
          createMockRouteData({
            name: 'test-param-user-userId',
            path: '/test-param/user/:userId()',
            file: '/app/pages/test-param/user/[userId].vue',
          }),
        ],
        expected: { parametrizedRoute: '/test-param/user/:userId()' },
      },
    ])('should match $description', ({ modules, currentUrl, buildTimePagesData, expected }) => {
      const result = extractParametrizedRouteFromContext(modules, currentUrl, buildTimePagesData);
      expect(result).toEqual(expected);
    });
  });

  describe('different folder structures', () => {
    it.each([
      {
        description: 'views folder instead of pages',
        folderName: 'views',
        modules: new Set(['app.vue', 'views/dashboard.vue']),
        routeFile: '/app/views/dashboard.vue',
        routePath: '/dashboard',
      },
      {
        description: 'routes folder',
        folderName: 'routes',
        modules: new Set(['app.vue', 'routes/api/users.vue']),
        routeFile: '/app/routes/api/users.vue',
        routePath: '/api/users',
      },
      {
        description: 'src/pages folder structure',
        folderName: 'src/pages',
        modules: new Set(['app.vue', 'src/pages/contact.vue']),
        routeFile: '/app/src/pages/contact.vue',
        routePath: '/contact',
      },
    ])('should work with $description', ({ modules, routeFile, routePath }) => {
      const buildTimePagesData = [
        createMockRouteData({
          name: 'test-route',
          path: routePath,
          file: routeFile,
        }),
      ];

      const result = extractParametrizedRouteFromContext(modules, routePath, buildTimePagesData);
      expect(result).toEqual({ parametrizedRoute: routePath });
    });
  });

  describe('multiple routes matching', () => {
    it('should find the correct route when multiple routes exist', () => {
      const modules = new Set(['app.vue', 'pages/test-param/[param].vue', 'components/ErrorButton.vue']);

      const buildTimePagesData = [
        createMockRouteData({
          name: 'client-error',
          path: '/client-error',
          file: '/app/pages/client-error.vue',
        }),
        createMockRouteData({
          name: 'fetch-server-error',
          path: '/fetch-server-error',
          file: '/app/pages/fetch-server-error.vue',
        }),
        createMockRouteData({
          name: 'test-param-param',
          path: '/test-param/:param()',
          file: '/app/pages/test-param/[param].vue',
        }),
        createMockRouteData({
          name: 'test-param-user-userId',
          path: '/test-param/user/:userId()',
          file: '/app/pages/test-param/user/[userId].vue',
        }),
      ];

      const result = extractParametrizedRouteFromContext(modules, '/test-param/123', buildTimePagesData);
      expect(result).toEqual({ parametrizedRoute: '/test-param/:param()' });
    });

    it('should return null for non-route files', () => {
      const modules = new Set(['app.vue', 'components/Header.vue', 'components/Footer.vue', 'layouts/default.vue']);

      const buildTimePagesData = [
        createMockRouteData({
          name: 'home',
          path: '/home',
          file: '/app/pages/home.vue',
        }),
      ];

      // /test is not in the module Set
      const result = extractParametrizedRouteFromContext(modules, '/test', buildTimePagesData);
      expect(result).toEqual(null);
    });
  });

  describe('complex path scenarios', () => {
    it.each([
      {
        description: 'absolute path with multiple directories',
        file: 'folders/XYZ/some-folder/app/pages/client-error.vue',
        module: 'pages/client-error.vue',
        path: '/client-error',
      },
      {
        description: 'absolute path with dynamic route',
        file: '/private/var/folders/XYZ/some-folder/app/pages/test-param/user/[userId].vue',
        module: 'pages/test-param/user/[userId].vue',
        path: '/test-param/user/:userId()',
      },
      {
        description: 'Windows-style path separators',
        file: 'C:\\app\\pages\\dashboard\\index.vue',
        module: 'pages/dashboard/index.vue',
        path: '/dashboard',
      },
    ])('should handle $description', ({ file, module, path }) => {
      const modules = new Set([module, 'app.vue']);
      const buildTimePagesData = [
        createMockRouteData({
          name: 'test-route',
          path,
          file,
        }),
      ];

      const result = extractParametrizedRouteFromContext(modules, '/test-url', buildTimePagesData);
      expect(result).toEqual({ parametrizedRoute: path });
    });
  });

  describe('no matches', () => {
    it('should return null when no route data matches any module', () => {
      const modules = new Set(['pages/non-existent.vue']);
      const buildTimePagesData = [
        createMockRouteData({
          name: 'home',
          path: '/home',
          file: '/app/pages/home.vue',
        }),
        createMockRouteData({
          name: 'about',
          path: '/about',
          file: '/app/pages/about.vue',
        }),
      ];

      const result = extractParametrizedRouteFromContext(modules, '/non-existent', buildTimePagesData);
      expect(result).toEqual(null);
    });

    it('should exclude root-level modules correctly', () => {
      const modules = new Set(['app.vue', 'error.vue', 'middleware.js']);
      const buildTimePagesData = [
        createMockRouteData({
          name: 'app',
          path: '/',
          file: '/app/app.vue',
        }),
      ];

      const result = extractParametrizedRouteFromContext(modules, '/', buildTimePagesData);
      expect(result).toEqual(null);
    });
  });

  describe('malformed data handling', () => {
    it('should handle modules with empty strings', () => {
      const modules = new Set(['', 'pages/test.vue', '   ']);
      const buildTimePagesData = [
        createMockRouteData({
          name: 'test',
          path: '/test',
          file: '/app/pages/test.vue',
        }),
      ];

      const result = extractParametrizedRouteFromContext(modules, '/test', buildTimePagesData);
      expect(result).toEqual({ parametrizedRoute: '/test' });
    });
  });

  describe('edge case file patterns', () => {
    it('should handle file paths that do not follow standard patterns', () => {
      const modules = new Set(['custom/special-route.vue']);
      const buildTimePagesData = [
        createMockRouteData({
          name: 'special',
          path: '/special',
          file: '/unusual/path/structure/custom/special-route.vue',
        }),
      ];

      const result = extractParametrizedRouteFromContext(modules, '/special', buildTimePagesData);
      expect(result).toEqual({ parametrizedRoute: '/special' });
    });

    it('should not match when file patterns are completely different', () => {
      const modules = new Set(['pages/user.vue']);
      const buildTimePagesData = [
        createMockRouteData({
          name: 'admin',
          path: '/admin',
          file: '/app/admin/dashboard.vue', // Different structure
        }),
      ];

      const result = extractParametrizedRouteFromContext(modules, '/user', buildTimePagesData);
      expect(result).toEqual(null);
    });
  });
});
