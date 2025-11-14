import path from 'path';
import { describe, expect, test } from 'vitest';
import { createRouteManifest } from '../../../../../src/config/manifest/createRouteManifest';

describe('dynamic', () => {
  const manifest = createRouteManifest({ appDirPath: path.join(__dirname, 'app') });

  test('should generate a dynamic manifest', () => {
    expect(manifest).toEqual({
      staticRoutes: [{ path: '/' }, { path: '/dynamic/static' }, { path: '/static/nested' }],
      dynamicRoutes: [
        {
          path: '/dynamic/:id',
          regex: '^/dynamic/([^/]+)$',
          paramNames: ['id'],
          hasOptionalPrefix: false,
        },
        {
          path: '/users/:id',
          regex: '^/users/([^/]+)$',
          paramNames: ['id'],
          hasOptionalPrefix: false,
        },
        {
          path: '/users/:id/posts/:postId',
          regex: '^/users/([^/]+)/posts/([^/]+)$',
          paramNames: ['id', 'postId'],
          hasOptionalPrefix: false,
        },
        {
          path: '/users/:id/settings',
          regex: '^/users/([^/]+)/settings$',
          paramNames: ['id'],
          hasOptionalPrefix: false,
        },
      ],
      isrRoutes: [],
    });
  });

  test('should generate correct pattern for single dynamic route', () => {
    const singleDynamic = manifest.dynamicRoutes.find(route => route.path === '/dynamic/:id');
    const regex = new RegExp(singleDynamic?.regex ?? '');
    expect(regex.test('/dynamic/123')).toBe(true);
    expect(regex.test('/dynamic/abc')).toBe(true);
    expect(regex.test('/dynamic/123/456')).toBe(false);
    expect(regex.test('/dynamic123/123')).toBe(false);
    expect(regex.test('/')).toBe(false);
  });

  test('should generate correct pattern for mixed static-dynamic route', () => {
    const mixedRoute = manifest.dynamicRoutes.find(route => route.path === '/users/:id/settings');
    const regex = new RegExp(mixedRoute?.regex ?? '');

    expect(regex.test('/users/123/settings')).toBe(true);
    expect(regex.test('/users/john-doe/settings')).toBe(true);
    expect(regex.test('/users/123/settings/extra')).toBe(false);
    expect(regex.test('/users/123')).toBe(false);
    expect(regex.test('/settings')).toBe(false);
  });

  test('should generate correct pattern for multiple dynamic segments', () => {
    const multiDynamic = manifest.dynamicRoutes.find(route => route.path === '/users/:id/posts/:postId');
    const regex = new RegExp(multiDynamic?.regex ?? '');

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
    const userSettingsRoute = manifest.dynamicRoutes.find(route => route.path === '/users/:id/settings');
    expect(userSettingsRoute).toBeDefined();
    expect(userSettingsRoute?.regex).toBeDefined();

    const regex = new RegExp(userSettingsRoute!.regex!);
    expect(regex.test('/users/user-with-dashes/settings')).toBe(true);
    expect(regex.test('/users/user_with_underscores/settings')).toBe(true);
    expect(regex.test('/users/123/settings')).toBe(true);
    expect(regex.test('/users/123/settings/extra')).toBe(false);
  });
});
