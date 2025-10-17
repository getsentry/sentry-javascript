import type { AgnosticRouteObject } from '@remix-run/router';
import { describe, expect, it } from 'vitest';
import { getTransactionName } from '../../src/utils/utils';

describe('getTransactionName', () => {
  const mockRoutes: AgnosticRouteObject[] = [
    {
      id: 'routes/_index',
      path: '/',
    },
    {
      id: 'routes/user.$id',
      path: '/user/:id',
    },
    {
      id: 'routes/blog.$slug',
      path: '/blog/:slug',
    },
  ];

  describe('without Vite plugin manifest', () => {
    it('should return route ID for matched routes (backward compatibility)', () => {
      const url = new URL('http://localhost/user/123');
      const [name, source] = getTransactionName(mockRoutes, url);

      // Without manifest, should use old behavior (route ID)
      expect(name).toBe('routes/user.$id');
      expect(source).toBe('route');
    });

    it('should return route ID for index routes (backward compatibility)', () => {
      const url = new URL('http://localhost/');
      const [name, source] = getTransactionName(mockRoutes, url);

      // Without manifest, should use old behavior (route ID)
      expect(name).toBe('routes/_index');
      expect(source).toBe('route');
    });

    it('should return URL pathname for unmatched routes', () => {
      const url = new URL('http://localhost/unknown');
      const [name, source] = getTransactionName(mockRoutes, url);

      expect(name).toBe('/unknown');
      expect(source).toBe('url');
    });
  });

  describe('with Vite plugin manifest', () => {
    it('should return parameterized path when manifest is available', () => {
      // Simulate the Vite plugin injecting the manifest
      // @ts-expect-error - Injecting manifest for testing
      global._sentryRemixRouteManifest = JSON.stringify({
        staticRoutes: [{ path: '/' }],
        dynamicRoutes: [
          {
            path: '/user/:id',
            regex: '^/user/[^/]+/?$',
          },
        ],
      });

      const url = new URL('http://localhost/user/123');
      const [name, source] = getTransactionName(mockRoutes, url);

      // With manifest, should use new behavior (parameterized path)
      expect(name).toBe('/user/:id');
      expect(source).toBe('route');

      // Cleanup
      // @ts-expect-error - Cleaning up test manifest
      delete global._sentryRemixRouteManifest;
    });

    it('should return parameterized path for index routes when manifest is available', () => {
      // Simulate the Vite plugin injecting the manifest
      // @ts-expect-error - Injecting manifest for testing
      global._sentryRemixRouteManifest = JSON.stringify({
        staticRoutes: [{ path: '/' }],
        dynamicRoutes: [],
      });

      const url = new URL('http://localhost/');
      const [name, source] = getTransactionName(mockRoutes, url);

      // With manifest, should use new behavior (parameterized path)
      expect(name).toBe('/');
      expect(source).toBe('route');

      // Cleanup
      // @ts-expect-error - Cleaning up test manifest
      delete global._sentryRemixRouteManifest;
    });
  });
});
