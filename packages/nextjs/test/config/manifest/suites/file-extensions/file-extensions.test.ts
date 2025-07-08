import path from 'path';
import { describe, expect, test } from 'vitest';
import { createRouteManifest } from '../../../../../src/config/manifest/buildManifest';

describe('file-extensions', () => {
  const manifest = createRouteManifest({ appDirPath: path.join(__dirname, 'app') });

  test('should detect page files with all supported extensions', () => {
    expect(manifest).toEqual({
      dynamic: [],
      static: [
        { path: '/', dynamic: false },
        { path: '/javascript', dynamic: false },
        { path: '/jsx-route', dynamic: false },
        { path: '/mixed', dynamic: false },
        { path: '/precedence', dynamic: false },
        { path: '/typescript', dynamic: false },
      ],
    });
  });
});
