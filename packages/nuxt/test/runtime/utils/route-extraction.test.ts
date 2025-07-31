import { describe, expect, it } from 'vitest';
import type { NuxtPageSubset } from '../../../src/runtime/utils/route-extraction';
import { extractParametrizedRouteFromContext } from '../../../src/runtime/utils/route-extraction';

/** Creates a mock NuxtPage object with all existing pages. Nuxt provides this during the build time in the "pages:extend" hook.
 *  The content is inspired by a real-world example. */
const createMockPagesData = (
  overrides: NuxtPageSubset[] = [],
  addDefaultPageData: boolean = true,
): NuxtPageSubset[] => {
  const defaultBase = [
    // Basic routes
    { path: '/', file: '/private/folders/application/pages/index.vue' },
    { path: '/simple-page', file: '/private/folders/application/pages/simple-page.vue' },
    { path: '/a/nested/simple-page', file: '/private/folders/application/pages/a/nested/simple-page.vue' },
    // Dynamic routes (directory and file)
    { path: '/user/:userId()', file: '/private/folders/application/pages/user/[userId].vue' },
    { path: '/group-:name()/:id()', file: '/private/folders/application/pages/group-[name]/[id].vue' },
    // Catch-all routes
    { path: '/catch-all/:path(.*)*', file: '/private/folders/application/pages/catch-all/[...path].vue' },
  ];

  return [...(addDefaultPageData ? defaultBase : []), ...overrides];
};

// The base of modules when loading a specific page during runtime (inspired by real-world examples).
const defaultSSRContextModules = new Set([
  'node_modules/nuxt/dist/app/components/nuxt-root.vue',
  'app.vue',
  'components/Button.vue',
  // ...the specific requested page is added in the test (e.g. 'pages/user/[userId].vue')
]);

describe('extractParametrizedRouteFromContext', () => {
  describe('edge cases', () => {
    it('should return null when ssrContextModules is null', () => {
      const result = extractParametrizedRouteFromContext(null as any, '/test', []);
      expect(result).toBe(null);
    });

    it('should return null when currentUrl is null', () => {
      const result = extractParametrizedRouteFromContext(defaultSSRContextModules, null as any, []);
      expect(result).toBe(null);
    });

    it('should return null when currentUrl is undefined', () => {
      const result = extractParametrizedRouteFromContext(defaultSSRContextModules, undefined as any, []);
      expect(result).toBe(null);
    });

    it('should return null when buildTimePagesData is empty', () => {
      const result = extractParametrizedRouteFromContext(defaultSSRContextModules, '/test', []);
      expect(result).toEqual(null);
    });

    it('should return null when buildTimePagesData has no valid files', () => {
      const buildTimePagesData = createMockPagesData([
        { path: '/test', file: undefined },
        { path: '/about', file: null as any },
      ]);

      const result = extractParametrizedRouteFromContext(defaultSSRContextModules, '/test', buildTimePagesData);
      expect(result).toEqual(null);
    });
  });

  describe('basic route matching', () => {
    it.each([
      {
        description: 'basic page route',
        modules: new Set([...defaultSSRContextModules, 'pages/simple-page.vue']),
        requestedUrl: '/simple-page',
        buildTimePagesData: createMockPagesData(),
        expected: { parametrizedRoute: '/simple-page' },
      },
      {
        description: 'nested route',
        modules: new Set([...defaultSSRContextModules, 'pages/a/nested/simple-page.vue']),
        requestedUrl: '/a/nested/simple-page',
        buildTimePagesData: createMockPagesData(),
        expected: { parametrizedRoute: '/a/nested/simple-page' },
      },
      {
        description: 'dynamic route with brackets in file name',
        modules: new Set([...defaultSSRContextModules, 'pages/user/[userId].vue']),
        requestedUrl: '/user/123',
        buildTimePagesData: createMockPagesData(),
        expected: { parametrizedRoute: '/user/:userId()' },
      },
      {
        description: 'dynamic route with brackets in directory and file name',
        modules: new Set([...defaultSSRContextModules, 'pages/group-[name]/[id].vue']),
        requestedUrl: '/group-sentry/123',
        buildTimePagesData: createMockPagesData(),
        expected: { parametrizedRoute: '/group-:name()/:id()' },
      },
      {
        description: 'catch all route (simple)',
        modules: new Set([...defaultSSRContextModules, 'pages/catch-all/[...path].vue']),
        requestedUrl: '/catch-all/whatever',
        buildTimePagesData: createMockPagesData(),
        expected: { parametrizedRoute: '/catch-all/:path(.*)*' },
      },
      {
        description: 'catch all route (nested)',
        modules: new Set([...defaultSSRContextModules, 'pages/catch-all/[...path].vue']),
        requestedUrl: '/catch-all/whatever/you/want',
        buildTimePagesData: createMockPagesData(),
        expected: { parametrizedRoute: '/catch-all/:path(.*)*' },
      },
    ])('should match $description', ({ modules, requestedUrl, buildTimePagesData, expected }) => {
      const result = extractParametrizedRouteFromContext(modules, requestedUrl, buildTimePagesData);
      expect(result).toEqual(expected);
    });
  });

  describe('different folder structures (no pages directory)', () => {
    it.each([
      {
        description: 'views folder instead of pages',
        folderName: 'views',
        modules: new Set([...defaultSSRContextModules, 'views/dashboard.vue']),
        routeFile: '/app/views/dashboard.vue',
        routePath: '/dashboard',
      },
      {
        description: 'routes folder',
        folderName: 'routes',
        modules: new Set([...defaultSSRContextModules, 'routes/api/users.vue']),
        routeFile: '/app/routes/api/users.vue',
        routePath: '/api/users',
      },
      {
        description: 'src/pages folder structure',
        folderName: 'src/pages',
        modules: new Set([...defaultSSRContextModules, 'src/pages/contact.vue']),
        routeFile: '/app/src/pages/contact.vue',
        routePath: '/contact',
      },
    ])('should work with $description', ({ modules, routeFile, routePath }) => {
      const buildTimePagesData = createMockPagesData([{ path: routePath, file: routeFile }]);

      const result = extractParametrizedRouteFromContext(modules, routePath, buildTimePagesData);
      expect(result).toEqual({ parametrizedRoute: routePath });
    });
  });

  describe('multiple routes matching', () => {
    it('should return correct route app has a dynamic route and a static route that share the same path', () => {
      const modules = new Set([...defaultSSRContextModules, 'pages/user/settings.vue']);

      const buildTimePagesData = createMockPagesData(
        [
          { path: '/user/settings', file: '/private/folders/application/pages/user/settings.vue' },
          { path: '/user/:userId()', file: '/private/folders/application/pages/user/[userId].vue' },
        ],
        false,
      );

      const result = extractParametrizedRouteFromContext(modules, '/user/settings', buildTimePagesData);
      expect(result).toEqual({ parametrizedRoute: '/user/settings' });
    });

    it('should return correct route app has a dynamic route and a static route that share the same path (reverse)', () => {
      const modules = new Set([...defaultSSRContextModules, 'pages/user/settings.vue']);

      const buildTimePagesData = createMockPagesData([
        { path: '/user/:userId()', file: '/private/folders/application/pages/user/[userId].vue' },
        { path: '/user/settings', file: '/private/folders/application/pages/user/settings.vue' },
      ]);

      const result = extractParametrizedRouteFromContext(modules, '/user/settings', buildTimePagesData);
      expect(result).toEqual({ parametrizedRoute: '/user/settings' });
    });

    it('should return null for non-route files', () => {
      const modules = new Set(['app.vue', 'components/Header.vue', 'components/Footer.vue', 'layouts/default.vue']);

      // /simple-page is not in the module Set
      const result = extractParametrizedRouteFromContext(modules, '/simple-page', createMockPagesData());
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
        requestedUrl: '/client-error',
      },
      {
        description: 'absolute path with dynamic route',
        file: '/private/var/folders/XYZ/some-folder/app/pages/test-param/user/[userId].vue',
        module: 'pages/test-param/user/[userId].vue',
        path: '/test-param/user/:userId()',
        requestedUrl: '/test-param/user/123',
      },
      {
        description: 'Windows-style path separators',
        file: 'C:\\app\\pages\\dashboard\\index.vue',
        module: 'pages/dashboard/index.vue',
        path: '/dashboard',
        requestedUrl: '/dashboard',
      },
    ])('should handle $description', ({ file, module, path, requestedUrl }) => {
      const modules = new Set([...defaultSSRContextModules, module]);
      const buildTimePagesData = createMockPagesData([{ path, file }]);

      const result = extractParametrizedRouteFromContext(modules, requestedUrl, buildTimePagesData);
      expect(result).toEqual({ parametrizedRoute: path });
    });
  });

  describe('no matches', () => {
    it('should return null when no route data matches any module', () => {
      const modules = new Set([...defaultSSRContextModules, 'pages/non-existent.vue']);
      const buildTimePagesData = createMockPagesData();

      const result = extractParametrizedRouteFromContext(modules, '/non-existent', buildTimePagesData);
      expect(result).toEqual(null);
    });

    it('should exclude root-level modules correctly', () => {
      const modules = new Set([...defaultSSRContextModules, 'error.vue', 'middleware.js']);
      const buildTimePagesData = createMockPagesData([{ path: '/', file: '/app/app.vue' }]);

      const result = extractParametrizedRouteFromContext(modules, '/', buildTimePagesData);
      expect(result).toEqual(null);
    });
  });

  describe('malformed data handling', () => {
    it('should handle modules with empty strings', () => {
      const modules = new Set([...defaultSSRContextModules, '', 'pages/test.vue', '   ']);
      const buildTimePagesData = createMockPagesData([{ path: '/test', file: '/app/pages/test.vue' }]);

      const result = extractParametrizedRouteFromContext(modules, '/test', buildTimePagesData);
      expect(result).toEqual({ parametrizedRoute: '/test' });
    });
  });

  describe('edge case file patterns', () => {
    it('should handle file paths that do not follow standard patterns (module not included in pages data)', () => {
      const modules = new Set(['custom/special-route.vue']);
      const buildTimePagesData = createMockPagesData([
        {
          path: '/special',
          file: '/unusual/path/structure/custom/special-route.vue',
        },
      ]);

      const result = extractParametrizedRouteFromContext(modules, '/special', buildTimePagesData);
      expect(result).toEqual({ parametrizedRoute: '/special' });
    });

    it('should not match when file patterns are completely different', () => {
      const modules = new Set(['pages/user.vue']);
      const buildTimePagesData = createMockPagesData([
        {
          path: '/admin',
          file: '/app/admin/dashboard.vue', // Different structure
        },
      ]);

      const result = extractParametrizedRouteFromContext(modules, '/user', buildTimePagesData);
      expect(result).toEqual(null);
    });
  });
});
