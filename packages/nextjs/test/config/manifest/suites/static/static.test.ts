import path from 'path';
import { describe, expect, test } from 'vitest';
import { createRouteManifest } from '../../../../../src/config/manifest/build-manifest';

describe('simple', () => {
  test('should generate a static manifest', () => {
    const manifest = createRouteManifest({ appDirPath: path.join(__dirname, 'app') });
    expect(manifest).toEqual({
      dynamic: [],
      static: [
        { path: '/', dynamic: false },
        { path: '/some/nested', dynamic: false },
        { path: '/user', dynamic: false },
        { path: '/users', dynamic: false },
      ],
    });
  });
});
