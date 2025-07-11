import path from 'path';
import { describe, expect, test } from 'vitest';
import { createRouteManifest } from '../../../../../src/config/manifest/createRouteManifest';

describe('route-groups', () => {
  const manifest = createRouteManifest({ appDirPath: path.join(__dirname, 'app') });

  test('should generate a manifest with route groups', () => {
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
