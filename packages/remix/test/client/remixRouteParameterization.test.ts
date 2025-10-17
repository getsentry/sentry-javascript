import { GLOBAL_OBJ } from '@sentry/core';
import { afterEach, describe, expect, it } from 'vitest';
import { maybeParameterizeRemixRoute } from '../../src/client/remixRouteParameterization';
import type { RouteManifest } from '../../src/config/remixRouteManifest';

const globalWithInjectedManifest = GLOBAL_OBJ as typeof GLOBAL_OBJ & {
  _sentryRemixRouteManifest: string | undefined;
};

describe('maybeParameterizeRemixRoute', () => {
  const originalManifest = globalWithInjectedManifest._sentryRemixRouteManifest;

  afterEach(() => {
    globalWithInjectedManifest._sentryRemixRouteManifest = originalManifest;
  });

  describe('when no manifest is available', () => {
    it('should return undefined', () => {
      globalWithInjectedManifest._sentryRemixRouteManifest = undefined;

      expect(maybeParameterizeRemixRoute('/users/123')).toBeUndefined();
      expect(maybeParameterizeRemixRoute('/blog/my-post')).toBeUndefined();
      expect(maybeParameterizeRemixRoute('/')).toBeUndefined();
    });
  });

  describe('when manifest has static routes', () => {
    it('should return undefined for static routes', () => {
      const manifest: RouteManifest = {
        staticRoutes: [{ path: '/' }, { path: '/about' }, { path: '/contact' }, { path: '/blog/posts' }],
        dynamicRoutes: [],
      };
      globalWithInjectedManifest._sentryRemixRouteManifest = JSON.stringify(manifest);

      expect(maybeParameterizeRemixRoute('/')).toBeUndefined();
      expect(maybeParameterizeRemixRoute('/about')).toBeUndefined();
      expect(maybeParameterizeRemixRoute('/contact')).toBeUndefined();
      expect(maybeParameterizeRemixRoute('/blog/posts')).toBeUndefined();
    });
  });

  describe('when manifest has dynamic routes', () => {
    it('should return parameterized routes for matching dynamic routes', () => {
      const manifest: RouteManifest = {
        staticRoutes: [{ path: '/' }, { path: '/about' }],
        dynamicRoutes: [
          {
            path: '/users/:id',
            regex: '^/users/([^/]+)$',
            paramNames: ['id'],
          },
          {
            path: '/blog/:slug',
            regex: '^/blog/([^/]+)$',
            paramNames: ['slug'],
          },
          {
            path: '/users/:userId/posts/:postId',
            regex: '^/users/([^/]+)/posts/([^/]+)$',
            paramNames: ['userId', 'postId'],
          },
        ],
      };
      globalWithInjectedManifest._sentryRemixRouteManifest = JSON.stringify(manifest);

      expect(maybeParameterizeRemixRoute('/users/123')).toBe('/users/:id');
      expect(maybeParameterizeRemixRoute('/users/john-doe')).toBe('/users/:id');
      expect(maybeParameterizeRemixRoute('/blog/my-post')).toBe('/blog/:slug');
      expect(maybeParameterizeRemixRoute('/blog/hello-world')).toBe('/blog/:slug');
      expect(maybeParameterizeRemixRoute('/users/123/posts/456')).toBe('/users/:userId/posts/:postId');
      expect(maybeParameterizeRemixRoute('/users/john/posts/my-post')).toBe('/users/:userId/posts/:postId');
    });

    it('should return undefined for static routes even when dynamic routes exist', () => {
      const manifest: RouteManifest = {
        staticRoutes: [{ path: '/' }, { path: '/about' }],
        dynamicRoutes: [
          {
            path: '/users/:id',
            regex: '^/users/([^/]+)$',
            paramNames: ['id'],
          },
        ],
      };
      globalWithInjectedManifest._sentryRemixRouteManifest = JSON.stringify(manifest);

      expect(maybeParameterizeRemixRoute('/')).toBeUndefined();
      expect(maybeParameterizeRemixRoute('/about')).toBeUndefined();
    });

    it('should handle splat/catch-all routes', () => {
      const manifest: RouteManifest = {
        staticRoutes: [{ path: '/' }],
        dynamicRoutes: [
          {
            path: '/docs/:*',
            regex: '^/docs/(.+)$',
            paramNames: ['*'],
          },
          {
            path: '/:*',
            regex: '^/(.+)$',
            paramNames: ['*'],
          },
        ],
      };
      globalWithInjectedManifest._sentryRemixRouteManifest = JSON.stringify(manifest);

      expect(maybeParameterizeRemixRoute('/docs/intro')).toBe('/docs/:*');
      expect(maybeParameterizeRemixRoute('/docs/guide/getting-started')).toBe('/docs/:*');
      expect(maybeParameterizeRemixRoute('/anything/else')).toBe('/:*');
    });

    it('should handle routes with special characters', () => {
      const manifest: RouteManifest = {
        staticRoutes: [],
        dynamicRoutes: [
          {
            path: '/users/:id/settings',
            regex: '^/users/([^/]+)/settings$',
            paramNames: ['id'],
          },
        ],
      };
      globalWithInjectedManifest._sentryRemixRouteManifest = JSON.stringify(manifest);

      expect(maybeParameterizeRemixRoute('/users/user-with-dashes/settings')).toBe('/users/:id/settings');
      expect(maybeParameterizeRemixRoute('/users/user_with_underscores/settings')).toBe('/users/:id/settings');
      expect(maybeParameterizeRemixRoute('/users/123/settings')).toBe('/users/:id/settings');
    });

    it('should return the first matching dynamic route when sorted by specificity', () => {
      const manifest: RouteManifest = {
        staticRoutes: [],
        dynamicRoutes: [
          {
            path: '/:*',
            regex: '^/(.+)$',
            paramNames: ['*'],
          },
          {
            path: '/users/:id',
            regex: '^/users/([^/]+)$',
            paramNames: ['id'],
          },
        ],
      };
      globalWithInjectedManifest._sentryRemixRouteManifest = JSON.stringify(manifest);

      // Should prefer more specific route over catch-all
      expect(maybeParameterizeRemixRoute('/users/123')).toBe('/users/:id');
      expect(maybeParameterizeRemixRoute('/about/something')).toBe('/:*');
    });

    it('should return undefined for dynamic routes without regex', () => {
      const manifest: RouteManifest = {
        staticRoutes: [],
        dynamicRoutes: [
          {
            path: '/users/:id',
            paramNames: ['id'],
          },
        ],
      };
      globalWithInjectedManifest._sentryRemixRouteManifest = JSON.stringify(manifest);

      expect(maybeParameterizeRemixRoute('/users/123')).toBeUndefined();
    });

    it('should handle invalid regex patterns gracefully', () => {
      const manifest: RouteManifest = {
        staticRoutes: [],
        dynamicRoutes: [
          {
            path: '/users/:id',
            regex: '[invalid-regex',
            paramNames: ['id'],
          },
        ],
      };
      globalWithInjectedManifest._sentryRemixRouteManifest = JSON.stringify(manifest);

      expect(maybeParameterizeRemixRoute('/users/123')).toBeUndefined();
    });
  });

  describe('when route does not match any pattern', () => {
    it('should return undefined for unknown routes', () => {
      const manifest: RouteManifest = {
        staticRoutes: [{ path: '/about' }],
        dynamicRoutes: [
          {
            path: '/users/:id',
            regex: '^/users/([^/]+)$',
            paramNames: ['id'],
          },
        ],
      };
      globalWithInjectedManifest._sentryRemixRouteManifest = JSON.stringify(manifest);

      expect(maybeParameterizeRemixRoute('/unknown')).toBeUndefined();
      expect(maybeParameterizeRemixRoute('/posts/123')).toBeUndefined();
      expect(maybeParameterizeRemixRoute('/users/123/extra')).toBeUndefined();
    });
  });

  describe('edge cases', () => {
    it('should handle empty route', () => {
      const manifest: RouteManifest = {
        staticRoutes: [],
        dynamicRoutes: [],
      };
      globalWithInjectedManifest._sentryRemixRouteManifest = JSON.stringify(manifest);

      expect(maybeParameterizeRemixRoute('')).toBeUndefined();
    });

    it('should handle root route', () => {
      const manifest: RouteManifest = {
        staticRoutes: [{ path: '/' }],
        dynamicRoutes: [],
      };
      globalWithInjectedManifest._sentryRemixRouteManifest = JSON.stringify(manifest);

      expect(maybeParameterizeRemixRoute('/')).toBeUndefined();
    });

    it('should handle complex nested dynamic routes', () => {
      const manifest: RouteManifest = {
        staticRoutes: [],
        dynamicRoutes: [
          {
            path: '/api/v1/users/:id/posts/:postId/comments/:commentId',
            regex: '^/api/v1/users/([^/]+)/posts/([^/]+)/comments/([^/]+)$',
            paramNames: ['id', 'postId', 'commentId'],
          },
        ],
      };
      globalWithInjectedManifest._sentryRemixRouteManifest = JSON.stringify(manifest);

      expect(maybeParameterizeRemixRoute('/api/v1/users/123/posts/456/comments/789')).toBe(
        '/api/v1/users/:id/posts/:postId/comments/:commentId',
      );
    });
  });

  describe('realistic Remix patterns', () => {
    it.each([
      ['/', undefined],
      ['/about', undefined],
      ['/contact', undefined],
      ['/blog/posts', undefined],

      ['/users/123', '/users/:id'],
      ['/users/john-doe', '/users/:id'],
      ['/blog/my-post', '/blog/:slug'],
      ['/blog/hello-world', '/blog/:slug'],
      ['/users/123/posts/456', '/users/:userId/posts/:postId'],
      ['/users/john/posts/my-post', '/users/:userId/posts/:postId'],

      ['/docs/intro', '/docs/:*'],
      ['/docs/guide/getting-started', '/docs/:*'],

      ['/unknown-route', undefined],
      ['/api/unknown', undefined],
    ])('should handle route "%s" and return %s', (inputRoute, expectedRoute) => {
      const manifest: RouteManifest = {
        staticRoutes: [{ path: '/' }, { path: '/about' }, { path: '/contact' }, { path: '/blog/posts' }],
        dynamicRoutes: [
          {
            path: '/users/:id',
            regex: '^/users/([^/]+)$',
            paramNames: ['id'],
          },
          {
            path: '/blog/:slug',
            regex: '^/blog/([^/]+)$',
            paramNames: ['slug'],
          },
          {
            path: '/users/:userId/posts/:postId',
            regex: '^/users/([^/]+)/posts/([^/]+)$',
            paramNames: ['userId', 'postId'],
          },
          {
            path: '/docs/:*',
            regex: '^/docs/(.+)$',
            paramNames: ['*'],
          },
        ],
      };
      globalWithInjectedManifest._sentryRemixRouteManifest = JSON.stringify(manifest);

      if (expectedRoute === undefined) {
        expect(maybeParameterizeRemixRoute(inputRoute)).toBeUndefined();
      } else {
        expect(maybeParameterizeRemixRoute(inputRoute)).toBe(expectedRoute);
      }
    });
  });

  describe('route specificity and precedence', () => {
    it('should prefer more specific routes over catch-all routes', () => {
      const manifest: RouteManifest = {
        staticRoutes: [],
        dynamicRoutes: [
          {
            path: '/:parameter',
            regex: '^/([^/]+)$',
            paramNames: ['parameter'],
          },
          {
            path: '/:*',
            regex: '^/(.+)$',
            paramNames: ['*'],
          },
        ],
      };
      globalWithInjectedManifest._sentryRemixRouteManifest = JSON.stringify(manifest);

      // Single segment should match the specific route, not the catch-all
      expect(maybeParameterizeRemixRoute('/123')).toBe('/:parameter');
      expect(maybeParameterizeRemixRoute('/abc')).toBe('/:parameter');

      // Multiple segments should match the catch-all
      expect(maybeParameterizeRemixRoute('/123/456')).toBe('/:*');
    });

    it('should prefer routes with more static segments', () => {
      const manifest: RouteManifest = {
        staticRoutes: [],
        dynamicRoutes: [
          {
            path: '/api/users/:id',
            regex: '^/api/users/([^/]+)$',
            paramNames: ['id'],
          },
          {
            path: '/api/:resource/:id',
            regex: '^/api/([^/]+)/([^/]+)$',
            paramNames: ['resource', 'id'],
          },
          {
            path: '/:*',
            regex: '^/(.+)$',
            paramNames: ['*'],
          },
        ],
      };
      globalWithInjectedManifest._sentryRemixRouteManifest = JSON.stringify(manifest);

      // More specific route with static segments should win
      expect(maybeParameterizeRemixRoute('/api/users/123')).toBe('/api/users/:id');

      // Less specific but still targeted route should win over catch-all
      expect(maybeParameterizeRemixRoute('/api/posts/456')).toBe('/api/:resource/:id');

      // Unmatched patterns should fall back to catch-all
      expect(maybeParameterizeRemixRoute('/some/other/path')).toBe('/:*');
    });
  });

  describe('caching behavior', () => {
    it('should cache route results', () => {
      const manifest: RouteManifest = {
        staticRoutes: [],
        dynamicRoutes: [
          {
            path: '/users/:id',
            regex: '^/users/([^/]+)$',
            paramNames: ['id'],
          },
        ],
      };
      globalWithInjectedManifest._sentryRemixRouteManifest = JSON.stringify(manifest);

      const result1 = maybeParameterizeRemixRoute('/users/123');
      const result2 = maybeParameterizeRemixRoute('/users/123');

      expect(result1).toBe(result2);
      expect(result1).toBe('/users/:id');
    });

    it('should clear cache when manifest changes', () => {
      const manifest1: RouteManifest = {
        staticRoutes: [],
        dynamicRoutes: [
          {
            path: '/users/:id',
            regex: '^/users/([^/]+)$',
            paramNames: ['id'],
          },
        ],
      };
      globalWithInjectedManifest._sentryRemixRouteManifest = JSON.stringify(manifest1);

      expect(maybeParameterizeRemixRoute('/users/123')).toBe('/users/:id');

      // Change manifest
      const manifest2: RouteManifest = {
        staticRoutes: [],
        dynamicRoutes: [
          {
            path: '/members/:id',
            regex: '^/members/([^/]+)$',
            paramNames: ['id'],
          },
        ],
      };
      globalWithInjectedManifest._sentryRemixRouteManifest = JSON.stringify(manifest2);

      expect(maybeParameterizeRemixRoute('/users/123')).toBeUndefined();
      expect(maybeParameterizeRemixRoute('/members/123')).toBe('/members/:id');
    });
  });
});
