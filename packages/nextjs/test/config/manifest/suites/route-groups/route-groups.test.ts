import path from 'path';
import { describe, expect, test } from 'vitest';
import { createRouteManifest } from '../../../../../src/config/manifest/buildManifest';

describe('route-groups', () => {
  const manifest = createRouteManifest({ appDirPath: path.join(__dirname, 'app') });

  test('should generate a manifest with route groups', () => {
    expect(manifest).toEqual({
      dynamic: [
        {
          path: '/dashboard/:id',
          dynamic: true,
          pattern: '^/dashboard/([^/]+)$',
          paramNames: ['id'],
        },
      ],
      static: [
        { path: '/', dynamic: false },
        { path: '/login', dynamic: false },
        { path: '/signup', dynamic: false },
        { path: '/dashboard', dynamic: false },
        { path: '/settings/profile', dynamic: false },
        { path: '/public/about', dynamic: false },
      ],
    });
  });

  test('should handle dynamic routes within route groups', () => {
    const dynamicRoute = manifest.dynamic.find(route => route.path.includes('/dashboard/:id'));
    const regex = new RegExp(dynamicRoute?.pattern ?? '');
    expect(regex.test('/dashboard/123')).toBe(true);
    expect(regex.test('/dashboard/abc')).toBe(true);
    expect(regex.test('/dashboard/123/456')).toBe(false);
  });
});
