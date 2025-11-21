import path from 'path';
import { describe, expect, test } from 'vitest';
import { createRouteManifest } from '../../../../../src/config/manifest/createRouteManifest';

describe('file-extensions', () => {
  const manifest = createRouteManifest({ appDirPath: path.join(__dirname, 'app') });

  test('should detect page files with all supported extensions', () => {
    expect(manifest).toEqual({
      staticRoutes: [
        { path: '/' },
        { path: '/javascript' },
        { path: '/jsx-route' },
        { path: '/mixed' },
        { path: '/precedence' },
        { path: '/typescript' },
      ],
      dynamicRoutes: [],
      isrRoutes: [],
    });
  });
});
