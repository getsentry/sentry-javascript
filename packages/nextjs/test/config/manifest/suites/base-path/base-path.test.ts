import path from 'path';
import { describe, expect, test } from 'vitest';
import { createRouteManifest } from '../../../../../src/config/manifest/createRouteManifest';

describe('basePath', () => {
  test('should generate routes with base path prefix', () => {
    const manifest = createRouteManifest({
      basePath: '/my-app',
      appDirPath: path.join(__dirname, 'app'),
    });

    expect(manifest).toEqual({
      staticRoutes: [{ path: '/my-app' }, { path: '/my-app/about' }, { path: '/my-app/api/test' }],
      dynamicRoutes: [
        {
          path: '/my-app/users/:id',
          regex: '^/my-app/users/([^/]+)$',
          paramNames: ['id'],
          hasOptionalPrefix: false,
        },
      ],
      isrRoutes: [],
    });
  });

  test('should validate dynamic route regex with base path', () => {
    const manifest = createRouteManifest({
      basePath: '/my-app',
      appDirPath: path.join(__dirname, 'app'),
    });

    const dynamicRoute = manifest.dynamicRoutes.find(route => route.path === '/my-app/users/:id');
    const regex = new RegExp(dynamicRoute?.regex ?? '');

    // Should match valid paths with base path
    expect(regex.test('/my-app/users/123')).toBe(true);
    expect(regex.test('/my-app/users/john-doe')).toBe(true);

    // Should not match paths without base path
    expect(regex.test('/users/123')).toBe(false);

    // Should not match invalid paths
    expect(regex.test('/my-app/users/')).toBe(false);
    expect(regex.test('/my-app/users/123/extra')).toBe(false);
    expect(regex.test('/my-app/user/123')).toBe(false);
  });
});
