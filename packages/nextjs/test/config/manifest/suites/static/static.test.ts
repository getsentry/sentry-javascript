import path from 'path';
import { describe, expect, test } from 'vitest';
import { createRouteManifest } from '../../../../../src/config/manifest/createRouteManifest';

describe('static', () => {
  test('should generate a static manifest', () => {
    const manifest = createRouteManifest({ appDirPath: path.join(__dirname, 'app') });
    expect(manifest).toEqual({
      staticRoutes: [{ path: '/' }, { path: '/some/nested' }, { path: '/user' }, { path: '/users' }],
      dynamicRoutes: [],
      isrRoutes: [],
    });
  });
});
