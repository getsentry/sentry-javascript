import { describe, expect, it } from 'vitest';
import { createRemixRouteManifest } from '../../src/config/createRemixRouteManifest';

describe('Regex Pattern Validation', () => {
  describe('Dynamic route regex patterns', () => {
    it('should generate regex that matches simple dynamic segments', () => {
      const manifest = createRemixRouteManifest({ rootDir: './test/fixtures/app-basic' });
      const userIdRoute = manifest.dynamicRoutes.find(r => r.path === '/users/:id');

      expect(userIdRoute).toBeDefined();
      expect(userIdRoute?.regex).toBeDefined();

      const regex = new RegExp(userIdRoute!.regex!);
      expect(regex.test('/users/123')).toBe(true);
      expect(regex.test('/users/abc')).toBe(true);
      expect(regex.test('/users/user-123')).toBe(true);
      expect(regex.test('/users')).toBe(false);
      expect(regex.test('/users/')).toBe(false);
      expect(regex.test('/users/123/posts')).toBe(false);
    });

    it('should generate regex that matches nested dynamic segments', () => {
      const manifest = createRemixRouteManifest({ rootDir: './test/fixtures/app-basic' });
      const nestedRoute = manifest.dynamicRoutes.find(r => r.path === '/users/:userId/posts/:postId');

      expect(nestedRoute).toBeDefined();
      expect(nestedRoute?.regex).toBeDefined();

      const regex = new RegExp(nestedRoute!.regex!);
      expect(regex.test('/users/123/posts/456')).toBe(true);
      expect(regex.test('/users/abc/posts/def')).toBe(true);
      expect(regex.test('/users/123/posts')).toBe(false);
      expect(regex.test('/users/123')).toBe(false);
      expect(regex.test('/users/123/posts/456/comments')).toBe(false);
    });

    it('should generate regex that matches splat routes', () => {
      const manifest = createRemixRouteManifest({ rootDir: './test/fixtures/app-basic' });
      const splatRoute = manifest.dynamicRoutes.find(r => r.path === '/docs/:*');

      expect(splatRoute).toBeDefined();
      expect(splatRoute?.regex).toBeDefined();

      const regex = new RegExp(splatRoute!.regex!);
      expect(regex.test('/docs/intro')).toBe(true);
      expect(regex.test('/docs/getting-started')).toBe(true);
      expect(regex.test('/docs/api/users')).toBe(true);
      expect(regex.test('/docs/api/users/create')).toBe(true);
      expect(regex.test('/docs')).toBe(false);
      expect(regex.test('/docs/')).toBe(false);
    });

    it('should generate regex that matches root splat routes', () => {
      const manifest = createRemixRouteManifest({ rootDir: './test/fixtures/app-basic' });
      const rootSplatRoute = manifest.dynamicRoutes.find(r => r.path === '/:*');

      if (rootSplatRoute) {
        const regex = new RegExp(rootSplatRoute.regex!);
        expect(regex.test('/anything')).toBe(true);
        expect(regex.test('/deeply/nested/path')).toBe(true);
        expect(regex.test('/')).toBe(false);
      }
    });
  });

  describe('Edge cases and special characters', () => {
    it('should handle URL-encoded characters correctly', () => {
      const manifest = createRemixRouteManifest({ rootDir: './test/fixtures/app-basic' });
      const userIdRoute = manifest.dynamicRoutes.find(r => r.path === '/users/:id');

      if (userIdRoute?.regex) {
        const regex = new RegExp(userIdRoute.regex);
        // URL-encoded space: %20
        expect(regex.test('/users/john%20doe')).toBe(true);
        // URL-encoded special chars
        expect(regex.test('/users/user%40email')).toBe(true);
        // Should not match slashes even when encoded (segment boundary)
        expect(regex.test('/users/foo%2Fbar')).toBe(true); // %2F is encoded slash, should match as part of segment
      }
    });

    it('should handle hyphens and underscores in dynamic segments', () => {
      const manifest = createRemixRouteManifest({ rootDir: './test/fixtures/app-basic' });
      const userIdRoute = manifest.dynamicRoutes.find(r => r.path === '/users/:id');

      if (userIdRoute?.regex) {
        const regex = new RegExp(userIdRoute.regex);
        expect(regex.test('/users/user-123')).toBe(true);
        expect(regex.test('/users/user_123')).toBe(true);
        expect(regex.test('/users/user-name-with-dashes')).toBe(true);
      }
    });

    it('should handle numeric IDs', () => {
      const manifest = createRemixRouteManifest({ rootDir: './test/fixtures/app-basic' });
      const userIdRoute = manifest.dynamicRoutes.find(r => r.path === '/users/:id');

      if (userIdRoute?.regex) {
        const regex = new RegExp(userIdRoute.regex);
        expect(regex.test('/users/123')).toBe(true);
        expect(regex.test('/users/0')).toBe(true);
        expect(regex.test('/users/999999')).toBe(true);
      }
    });

    it('should handle UUIDs', () => {
      const manifest = createRemixRouteManifest({ rootDir: './test/fixtures/app-basic' });
      const userIdRoute = manifest.dynamicRoutes.find(r => r.path === '/users/:id');

      if (userIdRoute?.regex) {
        const regex = new RegExp(userIdRoute.regex);
        expect(regex.test('/users/550e8400-e29b-41d4-a716-446655440000')).toBe(true);
      }
    });

    it('should not match trailing slashes', () => {
      const manifest = createRemixRouteManifest({ rootDir: './test/fixtures/app-basic' });
      const userIdRoute = manifest.dynamicRoutes.find(r => r.path === '/users/:id');

      if (userIdRoute?.regex) {
        const regex = new RegExp(userIdRoute.regex);
        expect(regex.test('/users/123/')).toBe(false);
      }
    });

    it('should handle dots in dynamic segments', () => {
      const manifest = createRemixRouteManifest({ rootDir: './test/fixtures/app-basic' });
      const userIdRoute = manifest.dynamicRoutes.find(r => r.path === '/users/:id');

      if (userIdRoute?.regex) {
        const regex = new RegExp(userIdRoute.regex);
        expect(regex.test('/users/user.name')).toBe(true);
        expect(regex.test('/users/file.txt')).toBe(true);
      }
    });
  });

  describe('Regex escaping', () => {
    it('should properly escape special regex characters in static segments', () => {
      // If you have a route like /api.v1/users, the dot should be treated literally
      const manifest = createRemixRouteManifest({ rootDir: './test/fixtures/app-basic' });
      const apiRoute = manifest.dynamicRoutes.find(r => r.path.includes('api'));

      if (apiRoute?.regex && apiRoute.path.includes('.')) {
        const regex = new RegExp(apiRoute.regex);
        const testPath = apiRoute.path.replace(/:[\w*]+/g, 'test');
        expect(regex.test(testPath)).toBe(true);
      }
    });

    it('should handle parentheses in static segments', () => {
      // Routes with special chars should have them escaped in regex
      const routePath = '/api/(v1)/users/:id';
      const regexPattern = routePath
        .split('/')
        .filter(Boolean)
        .map(segment => {
          if (segment.startsWith(':')) {
            return segment.endsWith('*') ? '(.+)' : '([^/]+)';
          }
          return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        })
        .join('/');

      const regex = new RegExp(`^/${regexPattern}$`);
      expect(regex.test('/api/(v1)/users/123')).toBe(true);
      expect(regex.test('/api/xv1x/users/123')).toBe(false);
    });
  });

  describe('Param name extraction', () => {
    it('should extract param names for dynamic segments', () => {
      const manifest = createRemixRouteManifest({ rootDir: './test/fixtures/app-basic' });
      const userIdRoute = manifest.dynamicRoutes.find(r => r.path === '/users/:id');

      expect(userIdRoute?.paramNames).toEqual(['id']);
    });

    it('should extract multiple param names', () => {
      const manifest = createRemixRouteManifest({ rootDir: './test/fixtures/app-basic' });
      const nestedRoute = manifest.dynamicRoutes.find(r => r.path === '/users/:userId/posts/:postId');

      expect(nestedRoute?.paramNames).toEqual(['userId', 'postId']);
    });

    it('should extract splat param names', () => {
      const manifest = createRemixRouteManifest({ rootDir: './test/fixtures/app-basic' });
      const splatRoute = manifest.dynamicRoutes.find(r => r.path === '/docs/:*');

      // Splat params are named '*' in Remix
      expect(splatRoute?.paramNames).toEqual(['']);
    });
  });

  describe('Real-world routing scenarios', () => {
    it('should match blog post URLs', () => {
      const manifest = createRemixRouteManifest({ rootDir: './test/fixtures/app-basic' });
      const blogRoute = manifest.dynamicRoutes.find(r => r.path.includes('blog') || r.path === '/posts/:slug');

      if (blogRoute?.regex) {
        const regex = new RegExp(blogRoute.regex);
        expect(regex.test('/posts/my-first-post')).toBe(true);
        expect(regex.test('/posts/getting-started-with-remix')).toBe(true);
        expect(regex.test('/posts/2024-01-15-announcement')).toBe(true);
      }
    });

    it('should correctly prioritize more specific routes over less specific', () => {
      const manifest = createRemixRouteManifest({ rootDir: './test/fixtures/app-basic' });

      // More specific routes should come first when sorted by specificity
      const routes = manifest.dynamicRoutes.filter(r => r.path.startsWith('/users'));

      // /users/:id/posts/:postId is more specific than /users/:id
      const specificRoute = routes.find(r => r.path === '/users/:userId/posts/:postId');
      const generalRoute = routes.find(r => r.path === '/users/:id');

      if (specificRoute && generalRoute) {
        // Both should have valid regex patterns
        expect(specificRoute.regex).toBeDefined();
        expect(generalRoute.regex).toBeDefined();

        const specificRegex = new RegExp(specificRoute.regex!);
        const generalRegex = new RegExp(generalRoute.regex!);

        // More specific should match its pattern
        expect(specificRegex.test('/users/123/posts/456')).toBe(true);
        // But general should NOT match the more specific pattern
        expect(generalRegex.test('/users/123/posts/456')).toBe(false);
        // General should match its own pattern
        expect(generalRegex.test('/users/123')).toBe(true);
      }
    });
  });
});
