import path from 'path';
import { describe, expect, test } from 'vitest';
import { createRouteManifest } from '../../../../../src/config/manifest/buildManifest';

describe('catchall', () => {
  const manifest = createRouteManifest({ appDirPath: path.join(__dirname, 'app') });

  test('should generate a manifest with catchall route', () => {
    expect(manifest).toEqual({
      dynamic: [
        {
          path: '/catchall/:path*?',
          dynamic: true,
          pattern: '^/catchall/(.*)$',
          paramNames: ['path'],
        },
      ],
      static: [{ path: '/', dynamic: false }],
    });
  });

  test('should generate correct pattern for catchall route', () => {
    const regex = new RegExp(manifest.dynamic[0]?.pattern ?? '');
    expect(regex.test('/catchall/123')).toBe(true);
    expect(regex.test('/catchall/abc')).toBe(true);
    expect(regex.test('/catchall/123/456')).toBe(true);
    expect(regex.test('/catchall/123/abc/789')).toBe(true);
    expect(regex.test('/catchall/')).toBe(true);
    expect(regex.test('/123/catchall/123')).toBe(false);
    expect(regex.test('/')).toBe(false);
  });
});
