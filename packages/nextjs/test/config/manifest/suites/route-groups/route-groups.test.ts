import path from 'path';
import { describe, expect, test } from 'vitest';
import { createRouteManifest } from '../../../../../src/config/manifest/createRouteManifest';

describe('route-groups', () => {
  const appDirPath = path.join(__dirname, 'app');

  describe('default behavior (route groups stripped)', () => {
    const manifest = createRouteManifest({ appDirPath });

    test('should generate a manifest with route groups stripped', () => {
      expect(manifest).toEqual({
        staticRoutes: [
          { path: '/' },
          { path: '/api' },
          { path: '/login' },
          { path: '/signup' },
          { path: '/login' }, // from (auth-v2)
          { path: '/dashboard' },
          { path: '/settings/profile' },
          { path: '/public/about' },
          { path: '/features' },
        ],
        dynamicRoutes: [
          {
            path: '/dashboard/:id',
            regex: '^/dashboard/([^/]+)$',
            paramNames: ['id'],
            hasOptionalPrefix: false,
          },
        ],
        isrRoutes: [],
      });
      // Verify we have 9 static routes total (including duplicates from special chars)
      expect(manifest.staticRoutes).toHaveLength(9);
    });

    test('should handle dynamic routes within route groups', () => {
      const dynamicRoute = manifest.dynamicRoutes.find(route => route.path.includes('/dashboard/:id'));
      const regex = new RegExp(dynamicRoute?.regex ?? '');
      expect(regex.test('/dashboard/123')).toBe(true);
      expect(regex.test('/dashboard/abc')).toBe(true);
      expect(regex.test('/dashboard/123/456')).toBe(false);
    });

    test.each([
      { routeGroup: '(auth-v2)', strippedPath: '/login', description: 'hyphens' },
      { routeGroup: '(api_internal)', strippedPath: '/api', description: 'underscores' },
      { routeGroup: '(v2.0.beta)', strippedPath: '/features', description: 'dots' },
    ])('should strip route groups with $description', ({ routeGroup, strippedPath }) => {
      // Verify the stripped path exists
      expect(manifest.staticRoutes.find(route => route.path === strippedPath)).toBeDefined();
      // Verify the route group was stripped, not included
      expect(manifest.staticRoutes.find(route => route.path.includes(routeGroup))).toBeUndefined();
    });
  });

  describe('includeRouteGroups: true', () => {
    const manifest = createRouteManifest({ appDirPath, includeRouteGroups: true });

    test('should generate a manifest with route groups included', () => {
      expect(manifest).toEqual({
        staticRoutes: [
          { path: '/' },
          { path: '/(api_internal)/api' },
          { path: '/(auth)/login' },
          { path: '/(auth)/signup' },
          { path: '/(auth-v2)/login' },
          { path: '/(dashboard)/dashboard' },
          { path: '/(dashboard)/settings/profile' },
          { path: '/(marketing)/public/about' },
          { path: '/(v2.0.beta)/features' },
        ],
        dynamicRoutes: [
          {
            path: '/(dashboard)/dashboard/:id',
            regex: '^/\\(dashboard\\)/dashboard/([^/]+)$',
            paramNames: ['id'],
            hasOptionalPrefix: false,
          },
        ],
        isrRoutes: [],
      });
      expect(manifest.staticRoutes).toHaveLength(9);
    });

    test('should handle dynamic routes within route groups with proper regex escaping', () => {
      const dynamicRoute = manifest.dynamicRoutes.find(route => route.path.includes('/(dashboard)/dashboard/:id'));
      const regex = new RegExp(dynamicRoute?.regex ?? '');
      expect(regex.test('/(dashboard)/dashboard/123')).toBe(true);
      expect(regex.test('/(dashboard)/dashboard/abc')).toBe(true);
      expect(regex.test('/(dashboard)/dashboard/123/456')).toBe(false);
      expect(regex.test('/dashboard/123')).toBe(false); // Should not match without route group
    });

    test('should properly extract parameter names from dynamic routes with route groups', () => {
      const dynamicRoute = manifest.dynamicRoutes.find(route => route.path.includes('/(dashboard)/dashboard/:id'));
      expect(dynamicRoute?.paramNames).toEqual(['id']);
    });

    test('should handle nested static routes within route groups', () => {
      const nestedStaticRoute = manifest.staticRoutes.find(route => route.path === '/(dashboard)/settings/profile');
      expect(nestedStaticRoute).toBeDefined();
    });

    test('should handle multiple route groups correctly', () => {
      const authLogin = manifest.staticRoutes.find(route => route.path === '/(auth)/login');
      const authSignup = manifest.staticRoutes.find(route => route.path === '/(auth)/signup');
      const marketingPublic = manifest.staticRoutes.find(route => route.path === '/(marketing)/public/about');

      expect(authLogin).toBeDefined();
      expect(authSignup).toBeDefined();
      expect(marketingPublic).toBeDefined();
    });

    test.each([
      { fullPath: '/(auth-v2)/login', description: 'hyphens' },
      { fullPath: '/(api_internal)/api', description: 'underscores' },
      { fullPath: '/(v2.0.beta)/features', description: 'dots' },
    ])('should preserve route groups with $description when includeRouteGroups is true', ({ fullPath }) => {
      expect(manifest.staticRoutes.find(route => route.path === fullPath)).toBeDefined();
    });
  });
});
