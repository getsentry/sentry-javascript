import path from 'path';
import { describe, expect, test } from 'vitest';
import { createRouteManifest } from '../../../../../src/config/manifest/createRouteManifest';

describe('route-groups', () => {
  const manifest = createRouteManifest({ appDirPath: path.join(__dirname, 'app') });

  test('should generate a manifest with route groups', () => {
    expect(manifest).toEqual({
      routes: [
        { path: '/' },
        { path: '/login' },
        { path: '/signup' },
        { path: '/dashboard' },
        {
          path: '/dashboard/:id',
          regex: '^/dashboard/([^/]+)$',
          paramNames: ['id'],
        },
        { path: '/settings/profile' },
        { path: '/public/about' },
      ],
    });
  });

  test('should handle dynamic routes within route groups', () => {
    const dynamicRoute = manifest.routes.find(route => route.path.includes('/dashboard/:id'));
    const regex = new RegExp(dynamicRoute?.regex ?? '');
    expect(regex.test('/dashboard/123')).toBe(true);
    expect(regex.test('/dashboard/abc')).toBe(true);
    expect(regex.test('/dashboard/123/456')).toBe(false);
  });
});
