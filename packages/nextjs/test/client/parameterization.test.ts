import { GLOBAL_OBJ } from '@sentry/core';
import { afterEach, describe, expect, it } from 'vitest';
import { maybeParameterizeRoute } from '../../src/client/routing/parameterization';
import type { RouteManifest } from '../../src/config/manifest/types';

const globalWithInjectedManifest = GLOBAL_OBJ as typeof GLOBAL_OBJ & {
  _sentryRouteManifest: string | undefined;
};

describe('maybeParameterizeRoute', () => {
  const originalManifest = globalWithInjectedManifest._sentryRouteManifest;

  afterEach(() => {
    globalWithInjectedManifest._sentryRouteManifest = originalManifest;
  });

  describe('when no manifest is available', () => {
    it('should return undefined', () => {
      globalWithInjectedManifest._sentryRouteManifest = undefined;

      expect(maybeParameterizeRoute('/users/123')).toBeUndefined();
      expect(maybeParameterizeRoute('/posts/456/comments')).toBeUndefined();
      expect(maybeParameterizeRoute('/')).toBeUndefined();
    });
  });

  describe('when manifest has static routes', () => {
    it('should return undefined for static routes', () => {
      const manifest: RouteManifest = {
        staticRoutes: [{ path: '/' }, { path: '/some/nested' }, { path: '/user' }, { path: '/users' }],
        dynamicRoutes: [],
      };
      globalWithInjectedManifest._sentryRouteManifest = JSON.stringify(manifest);

      expect(maybeParameterizeRoute('/')).toBeUndefined();
      expect(maybeParameterizeRoute('/some/nested')).toBeUndefined();
      expect(maybeParameterizeRoute('/user')).toBeUndefined();
      expect(maybeParameterizeRoute('/users')).toBeUndefined();
    });
  });

  describe('when manifest has dynamic routes', () => {
    it('should return parameterized routes for matching dynamic routes', () => {
      const manifest: RouteManifest = {
        staticRoutes: [{ path: '/' }, { path: '/dynamic/static' }, { path: '/static/nested' }],
        dynamicRoutes: [
          {
            path: '/dynamic/:id',
            regex: '^/dynamic/([^/]+)$',
            paramNames: ['id'],
          },
          {
            path: '/users/:id',
            regex: '^/users/([^/]+)$',
            paramNames: ['id'],
          },
          {
            path: '/users/:id/posts/:postId',
            regex: '^/users/([^/]+)/posts/([^/]+)$',
            paramNames: ['id', 'postId'],
          },
          {
            path: '/users/:id/settings',
            regex: '^/users/([^/]+)/settings$',
            paramNames: ['id'],
          },
        ],
      };
      globalWithInjectedManifest._sentryRouteManifest = JSON.stringify(manifest);

      expect(maybeParameterizeRoute('/dynamic/123')).toBe('/dynamic/:id');
      expect(maybeParameterizeRoute('/dynamic/abc')).toBe('/dynamic/:id');
      expect(maybeParameterizeRoute('/users/123')).toBe('/users/:id');
      expect(maybeParameterizeRoute('/users/john-doe')).toBe('/users/:id');
      expect(maybeParameterizeRoute('/users/123/posts/456')).toBe('/users/:id/posts/:postId');
      expect(maybeParameterizeRoute('/users/john/posts/my-post')).toBe('/users/:id/posts/:postId');
      expect(maybeParameterizeRoute('/users/123/settings')).toBe('/users/:id/settings');
      expect(maybeParameterizeRoute('/users/john-doe/settings')).toBe('/users/:id/settings');
    });

    it('should return undefined for static routes even when dynamic routes exist', () => {
      const manifest: RouteManifest = {
        staticRoutes: [{ path: '/' }, { path: '/dynamic/static' }, { path: '/static/nested' }],
        dynamicRoutes: [
          {
            path: '/dynamic/:id',
            regex: '^/dynamic/([^/]+)$',
            paramNames: ['id'],
          },
        ],
      };
      globalWithInjectedManifest._sentryRouteManifest = JSON.stringify(manifest);

      expect(maybeParameterizeRoute('/')).toBeUndefined();
      expect(maybeParameterizeRoute('/dynamic/static')).toBeUndefined();
      expect(maybeParameterizeRoute('/static/nested')).toBeUndefined();
    });

    it('should handle catchall routes', () => {
      const manifest: RouteManifest = {
        staticRoutes: [{ path: '/' }],
        dynamicRoutes: [
          {
            path: '/catchall/:path*?',
            regex: '^/catchall(?:/(.*))?$',
            paramNames: ['path'],
          },
        ],
      };
      globalWithInjectedManifest._sentryRouteManifest = JSON.stringify(manifest);

      expect(maybeParameterizeRoute('/catchall/123')).toBe('/catchall/:path*?');
      expect(maybeParameterizeRoute('/catchall/abc')).toBe('/catchall/:path*?');
      expect(maybeParameterizeRoute('/catchall/123/456')).toBe('/catchall/:path*?');
      expect(maybeParameterizeRoute('/catchall/123/abc/789')).toBe('/catchall/:path*?');
      expect(maybeParameterizeRoute('/catchall/')).toBe('/catchall/:path*?');
      expect(maybeParameterizeRoute('/catchall')).toBe('/catchall/:path*?');
    });

    it('should handle route groups when included', () => {
      const manifest: RouteManifest = {
        staticRoutes: [
          { path: '/' },
          { path: '/(auth)/login' },
          { path: '/(auth)/signup' },
          { path: '/(dashboard)/dashboard' },
          { path: '/(dashboard)/settings/profile' },
          { path: '/(marketing)/public/about' },
        ],
        dynamicRoutes: [
          {
            path: '/(dashboard)/dashboard/:id',
            regex: '^/\\(dashboard\\)/dashboard/([^/]+)$',
            paramNames: ['id'],
          },
        ],
      };
      globalWithInjectedManifest._sentryRouteManifest = JSON.stringify(manifest);

      expect(maybeParameterizeRoute('/(auth)/login')).toBeUndefined();
      expect(maybeParameterizeRoute('/(auth)/signup')).toBeUndefined();
      expect(maybeParameterizeRoute('/(dashboard)/dashboard')).toBeUndefined();
      expect(maybeParameterizeRoute('/(dashboard)/settings/profile')).toBeUndefined();
      expect(maybeParameterizeRoute('/(marketing)/public/about')).toBeUndefined();
      expect(maybeParameterizeRoute('/(dashboard)/dashboard/123')).toBe('/(dashboard)/dashboard/:id');
    });

    it('should handle route groups when stripped (default behavior)', () => {
      const manifest: RouteManifest = {
        staticRoutes: [
          { path: '/' },
          { path: '/login' },
          { path: '/signup' },
          { path: '/dashboard' },
          { path: '/settings/profile' },
          { path: '/public/about' },
        ],
        dynamicRoutes: [
          {
            path: '/dashboard/:id',
            regex: '^/dashboard/([^/]+)$',
            paramNames: ['id'],
          },
        ],
      };
      globalWithInjectedManifest._sentryRouteManifest = JSON.stringify(manifest);

      expect(maybeParameterizeRoute('/login')).toBeUndefined();
      expect(maybeParameterizeRoute('/signup')).toBeUndefined();
      expect(maybeParameterizeRoute('/dashboard')).toBeUndefined();
      expect(maybeParameterizeRoute('/settings/profile')).toBeUndefined();
      expect(maybeParameterizeRoute('/public/about')).toBeUndefined();
      expect(maybeParameterizeRoute('/dashboard/123')).toBe('/dashboard/:id');
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
      globalWithInjectedManifest._sentryRouteManifest = JSON.stringify(manifest);

      expect(maybeParameterizeRoute('/users/user-with-dashes/settings')).toBe('/users/:id/settings');
      expect(maybeParameterizeRoute('/users/user_with_underscores/settings')).toBe('/users/:id/settings');
      expect(maybeParameterizeRoute('/users/123/settings')).toBe('/users/:id/settings');
    });

    it('should return the first matching dynamic route', () => {
      const manifest: RouteManifest = {
        staticRoutes: [],
        dynamicRoutes: [
          {
            path: '/:slug',
            regex: '^/([^/]+)$',
            paramNames: ['slug'],
          },
          {
            path: '/users/:id',
            regex: '^/users/([^/]+)$',
            paramNames: ['id'],
          },
        ],
      };
      globalWithInjectedManifest._sentryRouteManifest = JSON.stringify(manifest);

      expect(maybeParameterizeRoute('/users/123')).toBe('/users/:id');
      expect(maybeParameterizeRoute('/about')).toBe('/:slug');
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
      globalWithInjectedManifest._sentryRouteManifest = JSON.stringify(manifest);

      expect(maybeParameterizeRoute('/users/123')).toBeUndefined();
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
      globalWithInjectedManifest._sentryRouteManifest = JSON.stringify(manifest);

      expect(maybeParameterizeRoute('/users/123')).toBeUndefined();
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
      globalWithInjectedManifest._sentryRouteManifest = JSON.stringify(manifest);

      expect(maybeParameterizeRoute('/unknown')).toBeUndefined();
      expect(maybeParameterizeRoute('/posts/123')).toBeUndefined();
      expect(maybeParameterizeRoute('/users/123/extra')).toBeUndefined();
    });
  });

  describe('edge cases', () => {
    it('should handle empty route', () => {
      const manifest: RouteManifest = {
        staticRoutes: [],
        dynamicRoutes: [],
      };
      globalWithInjectedManifest._sentryRouteManifest = JSON.stringify(manifest);

      expect(maybeParameterizeRoute('')).toBeUndefined();
    });

    it('should handle root route', () => {
      const manifest: RouteManifest = {
        staticRoutes: [{ path: '/' }],
        dynamicRoutes: [],
      };
      globalWithInjectedManifest._sentryRouteManifest = JSON.stringify(manifest);

      expect(maybeParameterizeRoute('/')).toBeUndefined();
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
      globalWithInjectedManifest._sentryRouteManifest = JSON.stringify(manifest);

      expect(maybeParameterizeRoute('/api/v1/users/123/posts/456/comments/789')).toBe(
        '/api/v1/users/:id/posts/:postId/comments/:commentId',
      );
    });
  });

  describe('realistic Next.js App Router patterns', () => {
    it.each([
      ['/', undefined],
      ['/some/nested', undefined],
      ['/user', undefined],
      ['/users', undefined],
      ['/dynamic/static', undefined],
      ['/static/nested', undefined],
      ['/login', undefined],
      ['/signup', undefined],
      ['/dashboard', undefined],
      ['/settings/profile', undefined],
      ['/public/about', undefined],

      ['/dynamic/123', '/dynamic/:id'],
      ['/dynamic/abc', '/dynamic/:id'],
      ['/users/123', '/users/:id'],
      ['/users/john-doe', '/users/:id'],
      ['/users/123/posts/456', '/users/:id/posts/:postId'],
      ['/users/john/posts/my-post', '/users/:id/posts/:postId'],
      ['/users/123/settings', '/users/:id/settings'],
      ['/users/user-with-dashes/settings', '/users/:id/settings'],
      ['/dashboard/123', '/dashboard/:id'],

      ['/catchall/123', '/catchall/:path*?'],
      ['/catchall/abc', '/catchall/:path*?'],
      ['/catchall/123/456', '/catchall/:path*?'],
      ['/catchall/123/abc/789', '/catchall/:path*?'],
      ['/catchall/', '/catchall/:path*?'],
      ['/catchall', '/catchall/:path*?'],

      ['/unknown-route', undefined],
      ['/api/unknown', undefined],
      ['/posts/123', undefined],
    ])('should handle route "%s" and return %s', (inputRoute, expectedRoute) => {
      const manifest: RouteManifest = {
        staticRoutes: [
          { path: '/' },
          { path: '/some/nested' },
          { path: '/user' },
          { path: '/users' },
          { path: '/dynamic/static' },
          { path: '/static/nested' },
          { path: '/login' },
          { path: '/signup' },
          { path: '/dashboard' },
          { path: '/settings/profile' },
          { path: '/public/about' },
        ],
        dynamicRoutes: [
          {
            path: '/dynamic/:id',
            regex: '^/dynamic/([^/]+)$',
            paramNames: ['id'],
          },
          {
            path: '/users/:id',
            regex: '^/users/([^/]+)$',
            paramNames: ['id'],
          },
          {
            path: '/users/:id/posts/:postId',
            regex: '^/users/([^/]+)/posts/([^/]+)$',
            paramNames: ['id', 'postId'],
          },
          {
            path: '/users/:id/settings',
            regex: '^/users/([^/]+)/settings$',
            paramNames: ['id'],
          },
          {
            path: '/dashboard/:id',
            regex: '^/dashboard/([^/]+)$',
            paramNames: ['id'],
          },
          {
            path: '/catchall/:path*?',
            regex: '^/catchall(?:/(.*))?$',
            paramNames: ['path'],
          },
        ],
      };
      globalWithInjectedManifest._sentryRouteManifest = JSON.stringify(manifest);

      if (expectedRoute === undefined) {
        expect(maybeParameterizeRoute(inputRoute)).toBeUndefined();
      } else {
        expect(maybeParameterizeRoute(inputRoute)).toBe(expectedRoute);
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
            path: '/:parameters*',
            regex: '^/(.+)$',
            paramNames: ['parameters'],
          },
        ],
      };
      globalWithInjectedManifest._sentryRouteManifest = JSON.stringify(manifest);

      // Single segment should match the specific route, not the catch-all
      expect(maybeParameterizeRoute('/123')).toBe('/:parameter');
      expect(maybeParameterizeRoute('/abc')).toBe('/:parameter');
      expect(maybeParameterizeRoute('/user-id')).toBe('/:parameter');

      // Multiple segments should match the catch-all
      expect(maybeParameterizeRoute('/123/456')).toBe('/:parameters*');
      expect(maybeParameterizeRoute('/users/123/posts')).toBe('/:parameters*');
    });

    it('should prefer regular dynamic routes over optional catch-all routes', () => {
      const manifest: RouteManifest = {
        staticRoutes: [],
        dynamicRoutes: [
          {
            path: '/:parameter',
            regex: '^/([^/]+)$',
            paramNames: ['parameter'],
          },
          {
            path: '/:parameters*?',
            regex: '^(?:/(.*))?$',
            paramNames: ['parameters'],
          },
        ],
      };
      globalWithInjectedManifest._sentryRouteManifest = JSON.stringify(manifest);

      // Single segment should match the specific route, not the optional catch-all
      expect(maybeParameterizeRoute('/123')).toBe('/:parameter');
      expect(maybeParameterizeRoute('/test')).toBe('/:parameter');
    });

    it('should handle multiple levels of specificity correctly', () => {
      const manifest: RouteManifest = {
        staticRoutes: [{ path: '/static' }],
        dynamicRoutes: [
          {
            path: '/:param',
            regex: '^/([^/]+)$',
            paramNames: ['param'],
          },
          {
            path: '/:catch*',
            regex: '^/(.+)$',
            paramNames: ['catch'],
          },
          {
            path: '/:optional*?',
            regex: '^(?:/(.*))?$',
            paramNames: ['optional'],
          },
        ],
      };
      globalWithInjectedManifest._sentryRouteManifest = JSON.stringify(manifest);

      // Static route should take precedence (no parameterization)
      expect(maybeParameterizeRoute('/static')).toBeUndefined();

      // Single segment should match regular dynamic route
      expect(maybeParameterizeRoute('/dynamic')).toBe('/:param');

      // Multiple segments should match required catch-all over optional catch-all
      expect(maybeParameterizeRoute('/path/to/resource')).toBe('/:catch*');
    });

    it('should handle real-world Next.js app directory structure', () => {
      const manifest: RouteManifest = {
        staticRoutes: [{ path: '/' }, { path: '/about' }, { path: '/contact' }],
        dynamicRoutes: [
          {
            path: '/blog/:slug',
            regex: '^/blog/([^/]+)$',
            paramNames: ['slug'],
          },
          {
            path: '/users/:id',
            regex: '^/users/([^/]+)$',
            paramNames: ['id'],
          },
          {
            path: '/users/:id/posts/:postId',
            regex: '^/users/([^/]+)/posts/([^/]+)$',
            paramNames: ['id', 'postId'],
          },
          {
            path: '/:segments*',
            regex: '^/(.+)$',
            paramNames: ['segments'],
          },
          {
            path: '/:catch*?',
            regex: '^(?:/(.*))?$',
            paramNames: ['catch'],
          },
        ],
      };
      globalWithInjectedManifest._sentryRouteManifest = JSON.stringify(manifest);

      // Static routes should not be parameterized
      expect(maybeParameterizeRoute('/')).toBeUndefined();
      expect(maybeParameterizeRoute('/about')).toBeUndefined();
      expect(maybeParameterizeRoute('/contact')).toBeUndefined();

      // Specific dynamic routes should take precedence over catch-all
      expect(maybeParameterizeRoute('/blog/my-post')).toBe('/blog/:slug');
      expect(maybeParameterizeRoute('/users/123')).toBe('/users/:id');
      expect(maybeParameterizeRoute('/users/john/posts/456')).toBe('/users/:id/posts/:postId');

      // Unmatched multi-segment paths should match required catch-all
      expect(maybeParameterizeRoute('/api/v1/data')).toBe('/:segments*');
      expect(maybeParameterizeRoute('/some/deep/nested/path')).toBe('/:segments*');
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
            path: '/:segments*',
            regex: '^/(.+)$',
            paramNames: ['segments'],
          },
        ],
      };
      globalWithInjectedManifest._sentryRouteManifest = JSON.stringify(manifest);

      // More specific route with static segments should win
      expect(maybeParameterizeRoute('/api/users/123')).toBe('/api/users/:id');

      // Less specific but still targeted route should win over catch-all
      expect(maybeParameterizeRoute('/api/posts/456')).toBe('/api/:resource/:id');

      // Unmatched patterns should fall back to catch-all
      expect(maybeParameterizeRoute('/some/other/path')).toBe('/:segments*');
    });

    it('should handle complex nested catch-all scenarios', () => {
      const manifest: RouteManifest = {
        staticRoutes: [],
        dynamicRoutes: [
          {
            path: '/docs/:slug',
            regex: '^/docs/([^/]+)$',
            paramNames: ['slug'],
          },
          {
            path: '/docs/:sections*',
            regex: '^/docs/(.+)$',
            paramNames: ['sections'],
          },
          {
            path: '/files/:path*?',
            regex: '^/files(?:/(.*))?$',
            paramNames: ['path'],
          },
        ],
      };
      globalWithInjectedManifest._sentryRouteManifest = JSON.stringify(manifest);

      // Single segment should match specific route
      expect(maybeParameterizeRoute('/docs/introduction')).toBe('/docs/:slug');

      // Multiple segments should match catch-all
      expect(maybeParameterizeRoute('/docs/api/reference')).toBe('/docs/:sections*');
      expect(maybeParameterizeRoute('/docs/guide/getting-started/installation')).toBe('/docs/:sections*');

      // Optional catch-all should match both empty and filled cases
      expect(maybeParameterizeRoute('/files')).toBe('/files/:path*?');
      expect(maybeParameterizeRoute('/files/documents')).toBe('/files/:path*?');
      expect(maybeParameterizeRoute('/files/images/avatar.png')).toBe('/files/:path*?');
    });

    it('should correctly order routes by specificity score', () => {
      const manifest: RouteManifest = {
        staticRoutes: [],
        dynamicRoutes: [
          // These routes are intentionally in non-specificity order
          {
            path: '/:optional*?', // Specificity: 1000 (least specific)
            regex: '^(?:/(.*))?$',
            paramNames: ['optional'],
          },
          {
            path: '/:catchall*', // Specificity: 100
            regex: '^/(.+)$',
            paramNames: ['catchall'],
          },
          {
            path: '/api/:endpoint/:id', // Specificity: 20 (2 dynamic segments)
            regex: '^/api/([^/]+)/([^/]+)$',
            paramNames: ['endpoint', 'id'],
          },
          {
            path: '/users/:id', // Specificity: 10 (1 dynamic segment)
            regex: '^/users/([^/]+)$',
            paramNames: ['id'],
          },
          {
            path: '/api/users/:id', // Specificity: 10 (1 dynamic segment)
            regex: '^/api/users/([^/]+)$',
            paramNames: ['id'],
          },
        ],
      };
      globalWithInjectedManifest._sentryRouteManifest = JSON.stringify(manifest);

      // Most specific route should win despite order in manifest
      expect(maybeParameterizeRoute('/users/123')).toBe('/users/:id');
      expect(maybeParameterizeRoute('/api/users/456')).toBe('/api/users/:id');

      // More general dynamic route should win over catch-all
      expect(maybeParameterizeRoute('/api/posts/789')).toBe('/api/:endpoint/:id');

      // Catch-all should be used when no more specific routes match
      expect(maybeParameterizeRoute('/some/random/path')).toBe('/:catchall*');
    });
  });
});
