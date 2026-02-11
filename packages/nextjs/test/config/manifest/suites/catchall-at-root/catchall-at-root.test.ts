import path from 'path';
import { describe, expect, test } from 'vitest';
import { createRouteManifest } from '../../../../../src/config/manifest/createRouteManifest';

describe('catchall', () => {
  const manifest = createRouteManifest({ appDirPath: path.join(__dirname, 'app') });

  test('should generate a manifest with catchall route', () => {
    expect(manifest).toEqual({
      staticRoutes: [{ path: '/' }],
      dynamicRoutes: [
        {
          path: '/:path*?',
          regex: '^/(.*)$',
          paramNames: ['path'],
          hasOptionalPrefix: false,
        },
      ],
      isrRoutes: [],
    });
  });

  test('should generate correct pattern for catchall route', () => {
    const catchallRoute = manifest.dynamicRoutes.find(route => route.path === '/:path*?');
    const regex = new RegExp(catchallRoute?.regex ?? '');
    expect(regex.test('/123')).toBe(true);
    expect(regex.test('/abc')).toBe(true);
    expect(regex.test('/123/456')).toBe(true);
    expect(regex.test('/123/abc/789')).toBe(true);
    expect(regex.test('/')).toBe(true);
  });
});
