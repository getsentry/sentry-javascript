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
          { path: '/login' },
          { path: '/signup' },
          { path: '/dashboard' },
          { path: '/settings/profile' },
          { path: '/public/about' },
        ],
        dynamicRoutes: [
          {
            path: '/dashboard/:id',
            regex: '^/dashboard/([^/]+)$',
            paramNames: ['id'],
            hasOptionalPrefix: false,
          },
        ],
      });
    });

    test('should handle dynamic routes within route groups', () => {
      const dynamicRoute = manifest.dynamicRoutes.find(route => route.path.includes('/dashboard/:id'));
      const regex = new RegExp(dynamicRoute?.regex ?? '');
      expect(regex.test('/dashboard/123')).toBe(true);
      expect(regex.test('/dashboard/abc')).toBe(true);
      expect(regex.test('/dashboard/123/456')).toBe(false);
    });
  });

  describe('includeRouteGroups: true', () => {
    const manifest = createRouteManifest({ appDirPath, includeRouteGroups: true });

    test('should generate a manifest with route groups included', () => {
      expect(manifest).toEqual({
        staticRoutes: [
          { path: '/' },
          { path: '/(auth)/login' },
          { path: '/(auth)/signup' },
          { path: '/(dashboard)/dashboard' },
          { path: '/(dashboard)/settings/profile' },
          { path: '/(marketing)/public/about' },
        ],
        dynamicRoutes: [
          {
            path: '/(dashboard)/dashboard/:id',
            regex: '^/\\(dashboard\\)/dashboard/([^/]+)$',
            paramNames: ['id'],
            hasOptionalPrefix: false,
          },
        ],
      });
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
  });
});
