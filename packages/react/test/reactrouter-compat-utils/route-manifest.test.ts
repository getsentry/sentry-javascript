import { describe, expect, it } from 'vitest';
import { matchRouteManifest } from '../../src/reactrouter-compat-utils/route-manifest';

describe('matchRouteManifest', () => {
  const manifest = [
    '/',
    '/pricing',
    '/features',
    '/login',
    '/signup',
    '/reset-password/:token',
    '/org/:orgSlug',
    '/org/:orgSlug/dashboard',
    '/org/:orgSlug/projects',
    '/org/:orgSlug/projects/:projectId',
    '/org/:orgSlug/projects/:projectId/settings',
    '/org/:orgSlug/projects/:projectId/issues',
    '/org/:orgSlug/projects/:projectId/issues/:issueId',
    '/admin',
    '/admin/users',
    '/admin/users/:userId',
    '/wildcard/*',
  ];

  describe('exact matches', () => {
    it('matches root path', () => {
      expect(matchRouteManifest('/', manifest)).toBe('/');
    });

    it('matches simple paths', () => {
      expect(matchRouteManifest('/pricing', manifest)).toBe('/pricing');
      expect(matchRouteManifest('/features', manifest)).toBe('/features');
      expect(matchRouteManifest('/login', manifest)).toBe('/login');
    });

    it('matches admin paths', () => {
      expect(matchRouteManifest('/admin', manifest)).toBe('/admin');
      expect(matchRouteManifest('/admin/users', manifest)).toBe('/admin/users');
    });
  });

  describe('parameterized routes', () => {
    it('matches single parameter', () => {
      expect(matchRouteManifest('/reset-password/abc123', manifest)).toBe('/reset-password/:token');
      expect(matchRouteManifest('/admin/users/42', manifest)).toBe('/admin/users/:userId');
    });

    it('matches multiple parameters', () => {
      expect(matchRouteManifest('/org/acme', manifest)).toBe('/org/:orgSlug');
      expect(matchRouteManifest('/org/acme/dashboard', manifest)).toBe('/org/:orgSlug/dashboard');
      expect(matchRouteManifest('/org/acme/projects', manifest)).toBe('/org/:orgSlug/projects');
      expect(matchRouteManifest('/org/acme/projects/123', manifest)).toBe('/org/:orgSlug/projects/:projectId');
      expect(matchRouteManifest('/org/acme/projects/123/settings', manifest)).toBe(
        '/org/:orgSlug/projects/:projectId/settings',
      );
      expect(matchRouteManifest('/org/acme/projects/123/issues', manifest)).toBe(
        '/org/:orgSlug/projects/:projectId/issues',
      );
      expect(matchRouteManifest('/org/acme/projects/123/issues/456', manifest)).toBe(
        '/org/:orgSlug/projects/:projectId/issues/:issueId',
      );
    });
  });

  describe('wildcard routes', () => {
    it('matches wildcard with extra segments', () => {
      expect(matchRouteManifest('/wildcard/anything', manifest)).toBe('/wildcard/*');
      expect(matchRouteManifest('/wildcard/foo/bar/baz', manifest)).toBe('/wildcard/*');
    });

    it('matches wildcard with no extra segments (matches React Router behavior)', () => {
      // React Router's matchPath('/wildcard/*', '/wildcard') returns { params: { '*': '' } }
      // The splat can be empty string, so /wildcard matches /wildcard/*
      expect(matchRouteManifest('/wildcard', manifest)).toBe('/wildcard/*');
    });
  });

  describe('specificity sorting (React Router parity)', () => {
    // Verifies our sorting matches React Router's computeScore() algorithm
    // See: https://github.com/remix-run/react-router/blob/main/packages/react-router/lib/router/utils.ts
    // React Router scoring: static=10, dynamic=3, splat=-2 penalty, index=+2 bonus
    // For equal scores, manifest order is preserved (same as React Router)

    it('returns more specific route when multiple match', () => {
      // /org/:orgSlug should not match /org/acme/projects - the more specific pattern should win
      expect(matchRouteManifest('/org/acme/projects', manifest)).toBe('/org/:orgSlug/projects');
    });

    it('prefers literal segments over parameters (React Router: static=10 > dynamic=3)', () => {
      const manifestWithOverlap = ['/users/:id', '/users/me'];
      // /users/me: 2 + 10 + 10 = 22
      // /users/:id: 2 + 10 + 3 = 15
      expect(matchRouteManifest('/users/me', manifestWithOverlap)).toBe('/users/me');
      expect(matchRouteManifest('/users/123', manifestWithOverlap)).toBe('/users/:id');
    });

    it('prefers more segments (React Router: higher segment count = higher base score)', () => {
      const m = ['/users', '/users/:id', '/users/:id/posts'];
      // /users: 1 + 10 = 11
      // /users/:id: 2 + 10 + 3 = 15
      // /users/:id/posts: 3 + 10 + 3 + 10 = 26
      expect(matchRouteManifest('/users/123/posts', m)).toBe('/users/:id/posts');
    });

    it('prefers non-wildcard over wildcard (React Router: splat=-2 penalty)', () => {
      const m = ['/docs/*', '/docs/api'];
      // /docs/*: 2 + 10 + (-2) = 10
      // /docs/api: 2 + 10 + 10 = 22
      expect(matchRouteManifest('/docs/api', m)).toBe('/docs/api');
    });

    it('prefers longer wildcard prefix over shorter (React Router: more segments before splat)', () => {
      const m = ['/*', '/docs/*', '/docs/api/*'];
      // /*: 1 + (-2) = -1
      // /docs/*: 2 + 10 + (-2) = 10
      // /docs/api/*: 3 + 10 + 10 + (-2) = 21
      expect(matchRouteManifest('/docs/api/methods', m)).toBe('/docs/api/*');
      expect(matchRouteManifest('/docs/guide', m)).toBe('/docs/*');
      expect(matchRouteManifest('/other', m)).toBe('/*');
    });
  });

  describe('no match', () => {
    it('returns null for unmatched paths', () => {
      expect(matchRouteManifest('/unknown', manifest)).toBe(null);
      expect(matchRouteManifest('/org/acme/unknown', manifest)).toBe(null);
      expect(matchRouteManifest('/admin/unknown/path', manifest)).toBe(null);
    });

    it('returns null for empty manifest', () => {
      expect(matchRouteManifest('/pricing', [])).toBe(null);
    });
  });

  describe('edge cases', () => {
    it('returns null for empty pathname', () => {
      expect(matchRouteManifest('', manifest)).toBe(null);
    });

    it('returns null for undefined-like inputs', () => {
      expect(matchRouteManifest(null as unknown as string, manifest)).toBe(null);
      expect(matchRouteManifest(undefined as unknown as string, manifest)).toBe(null);
      expect(matchRouteManifest('/test', null as unknown as string[])).toBe(null);
      expect(matchRouteManifest('/test', undefined as unknown as string[])).toBe(null);
    });

    it('handles trailing slashes by normalizing them', () => {
      expect(matchRouteManifest('/pricing/', manifest)).toBe('/pricing');
      expect(matchRouteManifest('/admin/users/', manifest)).toBe('/admin/users');
    });

    it('handles pathname without leading slash by normalizing', () => {
      expect(matchRouteManifest('pricing', manifest)).toBe('/pricing');
    });

    it('handles double slashes in pathname', () => {
      expect(matchRouteManifest('//pricing', manifest)).toBe('/pricing');
      expect(matchRouteManifest('///admin//users', manifest)).toBe('/admin/users');
    });

    it('handles encoded characters in pathname', () => {
      expect(matchRouteManifest('/admin/users/John%20Doe', manifest)).toBe('/admin/users/:userId');
      expect(matchRouteManifest('/org/my%2Forg/dashboard', manifest)).toBe('/org/:orgSlug/dashboard');
    });

    it('handles different manifests with same length correctly', () => {
      const manifest1 = ['/users/:id', '/posts/:id'];
      const manifest2 = ['/orders/:id', '/items/:id'];

      expect(matchRouteManifest('/users/123', manifest1)).toBe('/users/:id');
      expect(matchRouteManifest('/orders/456', manifest2)).toBe('/orders/:id');
      expect(matchRouteManifest('/posts/789', manifest1)).toBe('/posts/:id');
      expect(matchRouteManifest('/items/abc', manifest2)).toBe('/items/:id');
    });
  });

  describe('advanced specificity', () => {
    it('handles consecutive parameters', () => {
      const m = ['/:a/:b', '/:a/literal'];
      expect(matchRouteManifest('/foo/literal', m)).toBe('/:a/literal');
      expect(matchRouteManifest('/foo/other', m)).toBe('/:a/:b');
    });

    it('matches wildcard after parameter', () => {
      const m = ['/users/:id', '/users/:id/*'];
      expect(matchRouteManifest('/users/123', m)).toBe('/users/:id');
      expect(matchRouteManifest('/users/123/settings/advanced', m)).toBe('/users/:id/*');
    });

    it('matches root wildcard as fallback', () => {
      const m = ['/', '/pricing', '/*'];
      expect(matchRouteManifest('/unknown/path', m)).toBe('/*');
      expect(matchRouteManifest('/pricing', m)).toBe('/pricing');
    });

    it('returns same result regardless of manifest order', () => {
      const m1 = ['/users/:id', '/users/me', '/users'];
      const m2 = ['/users/me', '/users', '/users/:id'];
      const m3 = ['/users', '/users/:id', '/users/me'];

      expect(matchRouteManifest('/users/me', m1)).toBe('/users/me');
      expect(matchRouteManifest('/users/me', m2)).toBe('/users/me');
      expect(matchRouteManifest('/users/me', m3)).toBe('/users/me');
    });

    it('handles dots in pathname segments', () => {
      const m = ['/api/v1.0/users', '/api/:version/users'];
      expect(matchRouteManifest('/api/v1.0/users', m)).toBe('/api/v1.0/users');
      expect(matchRouteManifest('/api/v2.0/users', m)).toBe('/api/:version/users');
    });

    it('handles deeply nested paths correctly', () => {
      const m = ['/a/b/c/d/e/:f', '/a/b/c/d/:e/:f', '/a/b/c/:d/:e/:f'];
      expect(matchRouteManifest('/a/b/c/d/e/123', m)).toBe('/a/b/c/d/e/:f');
      expect(matchRouteManifest('/a/b/c/d/x/123', m)).toBe('/a/b/c/d/:e/:f');
      expect(matchRouteManifest('/a/b/c/x/y/123', m)).toBe('/a/b/c/:d/:e/:f');
    });

    it('preserves manifest order when literal count is equal (React Router parity)', () => {
      // Both have 2 literals with equal specificity scores
      // React Router uses definition order for equal scores, so first in manifest wins
      // Users should order their manifest from most specific to least specific
      const m1 = ['/users/:id/settings', '/:type/123/settings'];
      expect(matchRouteManifest('/users/123/settings', m1)).toBe('/users/:id/settings');

      const m2 = ['/:type/123/settings', '/users/:id/settings'];
      expect(matchRouteManifest('/users/123/settings', m2)).toBe('/:type/123/settings');
    });
  });

  describe('manifest pattern normalization', () => {
    it('handles manifest patterns without leading slash', () => {
      const m = ['users/:id', 'posts'];
      expect(matchRouteManifest('/users/123', m)).toBe('users/:id');
      expect(matchRouteManifest('/posts', m)).toBe('posts');
    });

    it('handles manifest patterns with trailing slashes', () => {
      const m = ['/users/', '/posts/:id/'];
      expect(matchRouteManifest('/users', m)).toBe('/users/');
      expect(matchRouteManifest('/posts/123', m)).toBe('/posts/:id/');
    });

    it('handles duplicate patterns in manifest', () => {
      const m = ['/users/:id', '/users/:id', '/posts'];
      expect(matchRouteManifest('/users/123', m)).toBe('/users/:id');
      expect(matchRouteManifest('/posts', m)).toBe('/posts');
    });
  });

  describe('wildcard edge cases', () => {
    it('prefers literal over wildcard at same depth', () => {
      const m = ['/users/settings', '/users/*'];
      expect(matchRouteManifest('/users/settings', m)).toBe('/users/settings');
      expect(matchRouteManifest('/users/profile', m)).toBe('/users/*');
    });

    it('handles wildcard with parameter prefix', () => {
      const m = ['/:locale/*', '/:locale/about'];
      expect(matchRouteManifest('/en/about', m)).toBe('/:locale/about');
      expect(matchRouteManifest('/en/anything/else', m)).toBe('/:locale/*');
    });

    it('handles root wildcard matching everything', () => {
      const m = ['/*'];
      expect(matchRouteManifest('/anything', m)).toBe('/*');
      expect(matchRouteManifest('/deep/nested/path', m)).toBe('/*');
      expect(matchRouteManifest('/', m)).toBe('/*');
    });
  });

  describe('parameter patterns', () => {
    it('handles patterns starting with parameter', () => {
      const m = ['/:locale/users', '/:locale/posts/:id'];
      expect(matchRouteManifest('/en/users', m)).toBe('/:locale/users');
      expect(matchRouteManifest('/fr/posts/123', m)).toBe('/:locale/posts/:id');
    });

    it('handles single-segment parameter pattern', () => {
      const m = ['/:id'];
      expect(matchRouteManifest('/123', m)).toBe('/:id');
      expect(matchRouteManifest('/abc', m)).toBe('/:id');
    });

    it('matches numeric-only pathname segments', () => {
      const m = ['/:a/:b', '/users/:id'];
      expect(matchRouteManifest('/123/456', m)).toBe('/:a/:b');
      expect(matchRouteManifest('/users/789', m)).toBe('/users/:id');
    });

    it('handles special characters in literal segments', () => {
      const m = ['/api-v1/users', '/api_v2/posts', '/api.v3/items'];
      expect(matchRouteManifest('/api-v1/users', m)).toBe('/api-v1/users');
      expect(matchRouteManifest('/api_v2/posts', m)).toBe('/api_v2/posts');
      expect(matchRouteManifest('/api.v3/items', m)).toBe('/api.v3/items');
    });
  });

  describe('basename handling', () => {
    it('strips basename before matching', () => {
      expect(matchRouteManifest('/app/pricing', manifest, '/app')).toBe('/pricing');
      expect(matchRouteManifest('/app/org/acme/projects', manifest, '/app')).toBe('/org/:orgSlug/projects');
    });

    it('handles basename with trailing slash', () => {
      expect(matchRouteManifest('/app/pricing', manifest, '/app/')).toBe('/pricing');
      expect(matchRouteManifest('/app/login', manifest, '/app/')).toBe('/login');
    });

    it('handles root basename', () => {
      expect(matchRouteManifest('/pricing', manifest, '/')).toBe('/pricing');
    });

    it('handles case-insensitive basename matching', () => {
      expect(matchRouteManifest('/APP/pricing', manifest, '/app')).toBe('/pricing');
      expect(matchRouteManifest('/App/features', manifest, '/APP')).toBe('/features');
    });

    it('returns root when pathname equals basename', () => {
      expect(matchRouteManifest('/app', manifest, '/app')).toBe('/');
    });

    it('does not strip basename that is not a prefix', () => {
      expect(matchRouteManifest('/other/pricing', manifest, '/app')).toBe(null);
    });

    it('handles undefined basename', () => {
      expect(matchRouteManifest('/pricing', manifest, undefined)).toBe('/pricing');
    });

    it('handles empty string basename', () => {
      expect(matchRouteManifest('/pricing', manifest, '')).toBe('/pricing');
    });

    it('handles multi-level basename', () => {
      expect(matchRouteManifest('/app/v1/pricing', manifest, '/app/v1')).toBe('/pricing');
      expect(matchRouteManifest('/app/v1/org/acme', manifest, '/app/v1')).toBe('/org/:orgSlug');
    });

    it('handles basename with special characters', () => {
      expect(matchRouteManifest('/my-app/pricing', manifest, '/my-app')).toBe('/pricing');
      expect(matchRouteManifest('/my_app/login', manifest, '/my_app')).toBe('/login');
    });

    it('handles basename longer than pathname', () => {
      expect(matchRouteManifest('/app', manifest, '/app/v1/admin')).toBe(null);
    });

    it('does not strip basename that is a partial word match', () => {
      // /app should NOT match /application - basename must be complete segment
      expect(matchRouteManifest('/application/pricing', manifest, '/app')).toBe(null);
      expect(matchRouteManifest('/apps/pricing', manifest, '/app')).toBe(null);
    });

    it('does not incorrectly match when partial basename strip creates valid path', () => {
      // Bug scenario: basename /a, pathname /ab/pricing
      // Wrong: strips /a, leaving b/pricing which could match /b/pricing
      // Correct: /a is not a complete segment of /ab, so no stripping should occur
      const m = ['/b/pricing', '/pricing'];
      expect(matchRouteManifest('/ab/pricing', m, '/a')).toBe(null);
    });
  });
});
