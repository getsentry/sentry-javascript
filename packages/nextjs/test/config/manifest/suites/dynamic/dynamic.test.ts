import path from 'path';
import { describe, expect, test } from 'vitest';
import { createRouteManifest } from '../../../../../src/config/manifest/buildManifest';

describe('dynamic', () => {
  const manifest = createRouteManifest({ appDirPath: path.join(__dirname, 'app') });

  test('should generate a comprehensive dynamic manifest', () => {
    expect(manifest).toEqual({
      dynamic: [
        {
          path: '/dynamic/:id',
          dynamic: true,
          pattern: '^/dynamic/([^/]+)$',
          paramNames: ['id'],
        },
        {
          path: '/users/:id',
          dynamic: true,
          pattern: '^/users/([^/]+)$',
          paramNames: ['id'],
        },
        {
          path: '/users/:id/posts/:postId',
          dynamic: true,
          pattern: '^/users/([^/]+)/posts/([^/]+)$',
          paramNames: ['id', 'postId'],
        },
        {
          path: '/users/:id/settings',
          dynamic: true,
          pattern: '^/users/([^/]+)/settings$',
          paramNames: ['id'],
        },
      ],
      static: [
        { path: '/', dynamic: false },
        { path: '/static/nested', dynamic: false },
      ],
    });
  });

  test('should generate correct pattern for single dynamic route', () => {
    const singleDynamic = manifest.dynamic.find(route => route.path === '/dynamic/:id');
    const regex = new RegExp(singleDynamic?.pattern ?? '');
    expect(regex.test('/dynamic/123')).toBe(true);
    expect(regex.test('/dynamic/abc')).toBe(true);
    expect(regex.test('/dynamic/123/456')).toBe(false);
    expect(regex.test('/dynamic123/123')).toBe(false);
    expect(regex.test('/')).toBe(false);
  });

  test('should generate correct pattern for mixed static-dynamic route', () => {
    const mixedRoute = manifest.dynamic.find(route => route.path === '/users/:id/settings');
    const regex = new RegExp(mixedRoute?.pattern ?? '');

    expect(regex.test('/users/123/settings')).toBe(true);
    expect(regex.test('/users/john-doe/settings')).toBe(true);
    expect(regex.test('/users/123/settings/extra')).toBe(false);
    expect(regex.test('/users/123')).toBe(false);
    expect(regex.test('/settings')).toBe(false);
  });

  test('should generate correct pattern for multiple dynamic segments', () => {
    const multiDynamic = manifest.dynamic.find(route => route.path === '/users/:id/posts/:postId');
    const regex = new RegExp(multiDynamic?.pattern ?? '');

    expect(regex.test('/users/123/posts/456')).toBe(true);
    expect(regex.test('/users/john/posts/my-post')).toBe(true);
    expect(regex.test('/users/123/posts/456/comments')).toBe(false);
    expect(regex.test('/users/123/posts')).toBe(false);
    expect(regex.test('/users/123')).toBe(false);

    const match = '/users/123/posts/456'.match(regex);
    expect(match).toBeTruthy();
    expect(match?.[1]).toBe('123');
    expect(match?.[2]).toBe('456');
  });

  test('should handle special characters in dynamic segments', () => {
    // Test that dynamic segments with special characters work properly
    const userSettingsRoute = manifest.dynamic.find(route => route.path === '/users/:id/settings');
    expect(userSettingsRoute).toBeDefined();
    expect(userSettingsRoute?.pattern).toBeDefined();

    const regex = new RegExp(userSettingsRoute!.pattern!);
    expect(regex.test('/users/user-with-dashes/settings')).toBe(true);
    expect(regex.test('/users/user_with_underscores/settings')).toBe(true);
    expect(regex.test('/users/123/settings')).toBe(true);
    expect(regex.test('/users/123/settings/extra')).toBe(false);
  });
});
