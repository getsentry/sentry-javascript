import { describe, expect, it } from 'vitest';
import { convertRemixRouteToPath } from '../../src/config/createRemixRouteManifest';
import { convertRemixRouteIdToPath } from '../../src/utils/utils';

describe('Route Conversion Consistency', () => {
  describe('Build-time vs Runtime conversion', () => {
    it('should produce identical results for simple static routes', () => {
      // Build-time: filename
      const buildTime = convertRemixRouteToPath('about.tsx');
      // Runtime: route ID
      const runtime = convertRemixRouteIdToPath('routes/about');

      expect(buildTime?.path).toBe(runtime);
      expect(buildTime?.path).toBe('/about');
    });

    it('should produce identical results for index routes', () => {
      const buildTime = convertRemixRouteToPath('index.tsx');
      const runtime = convertRemixRouteIdToPath('routes/index');

      expect(buildTime?.path).toBe(runtime);
      expect(buildTime?.path).toBe('/');
    });

    it('should produce identical results for dynamic parameter routes', () => {
      const buildTime = convertRemixRouteToPath('users.$id.tsx');
      const runtime = convertRemixRouteIdToPath('routes/users.$id');

      expect(buildTime?.path).toBe(runtime);
      expect(buildTime?.path).toBe('/users/:id');
    });

    it('should produce identical results for nested dynamic routes', () => {
      const buildTime = convertRemixRouteToPath('users.$userId.posts.$postId.tsx');
      const runtime = convertRemixRouteIdToPath('routes/users.$userId.posts.$postId');

      expect(buildTime?.path).toBe(runtime);
      expect(buildTime?.path).toBe('/users/:userId/posts/:postId');
    });

    it('should produce identical results for splat routes', () => {
      const buildTime = convertRemixRouteToPath('docs.$.tsx');
      const runtime = convertRemixRouteIdToPath('routes/docs.$');

      expect(buildTime?.path).toBe(runtime);
      expect(buildTime?.path).toBe('/docs/:*');
    });

    it('should produce identical results for root splat routes', () => {
      const buildTime = convertRemixRouteToPath('$.tsx');
      const runtime = convertRemixRouteIdToPath('routes/$');

      expect(buildTime?.path).toBe(runtime);
      expect(buildTime?.path).toBe('/:*');
    });

    it('should produce identical results for nested folder routes', () => {
      const buildTime = convertRemixRouteToPath('users/$id.tsx');
      const runtime = convertRemixRouteIdToPath('routes/users.$id');

      expect(buildTime?.path).toBe(runtime);
      expect(buildTime?.path).toBe('/users/:id');
    });

    it('should produce identical results for nested folder with index', () => {
      const buildTime = convertRemixRouteToPath('users/index.tsx');
      const runtime = convertRemixRouteIdToPath('routes/users.index');

      expect(buildTime?.path).toBe(runtime);
      expect(buildTime?.path).toBe('/users');
    });

    it('should produce identical results for layout routes (underscore prefix)', () => {
      const buildTime = convertRemixRouteToPath('users._layout.profile.tsx');
      const runtime = convertRemixRouteIdToPath('routes/users._layout.profile');

      expect(buildTime?.path).toBe(runtime);
      expect(buildTime?.path).toBe('/users/profile');
    });

    it('should produce identical results for complex nested routes', () => {
      const buildTime = convertRemixRouteToPath('api.v1.users.$userId.posts.$postId.comments.tsx');
      const runtime = convertRemixRouteIdToPath('routes/api.v1.users.$userId.posts.$postId.comments');

      expect(buildTime?.path).toBe(runtime);
      expect(buildTime?.path).toBe('/api/v1/users/:userId/posts/:postId/comments');
    });

    it('should produce identical results for _index routes', () => {
      const buildTime = convertRemixRouteToPath('_index.tsx');
      const runtime = convertRemixRouteIdToPath('routes/_index');

      expect(buildTime?.path).toBe(runtime);
      expect(buildTime?.path).toBe('/');
    });
  });

  describe('Dynamic flag consistency', () => {
    it('should correctly identify static routes', () => {
      const result = convertRemixRouteToPath('about.tsx');
      expect(result?.isDynamic).toBe(false);
    });

    it('should correctly identify dynamic parameter routes', () => {
      const result = convertRemixRouteToPath('users.$id.tsx');
      expect(result?.isDynamic).toBe(true);
    });

    it('should correctly identify splat routes as dynamic', () => {
      const result = convertRemixRouteToPath('docs.$.tsx');
      expect(result?.isDynamic).toBe(true);
    });

    it('should correctly identify layout routes as static when no dynamic segments', () => {
      const result = convertRemixRouteToPath('users._layout.profile.tsx');
      expect(result?.isDynamic).toBe(false);
    });

    it('should correctly identify routes with both static and dynamic segments', () => {
      const result = convertRemixRouteToPath('users.$id.posts.tsx');
      expect(result?.isDynamic).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('should handle routes with multiple file extensions', () => {
      expect(convertRemixRouteToPath('users.tsx')?.path).toBe('/users');
      expect(convertRemixRouteToPath('users.ts')?.path).toBe('/users');
      expect(convertRemixRouteToPath('users.jsx')?.path).toBe('/users');
      expect(convertRemixRouteToPath('users.js')?.path).toBe('/users');
    });

    it('should handle empty segments gracefully', () => {
      const buildTime = convertRemixRouteToPath('users..posts.tsx');
      const runtime = convertRemixRouteIdToPath('routes/users..posts');

      expect(buildTime?.path).toBe(runtime);
    });

    it('should handle trailing index segments', () => {
      const buildTime = convertRemixRouteToPath('users.profile.index.tsx');
      const runtime = convertRemixRouteIdToPath('routes/users.profile.index');

      expect(buildTime?.path).toBe(runtime);
      expect(buildTime?.path).toBe('/users/profile');
    });

    it('should handle routes with directory separators in build-time', () => {
      const withSlash = convertRemixRouteToPath('users/$id/posts.tsx');
      const withDots = convertRemixRouteToPath('users.$id.posts.tsx');

      expect(withSlash?.path).toBe(withDots?.path);
      expect(withSlash?.path).toBe('/users/:id/posts');
    });
  });

  describe('Pathless layout routes', () => {
    it('should return null for standalone pathless layout routes', () => {
      // These are layout routes that don't contribute to the URL path
      // They should NOT be added to the route manifest
      expect(convertRemixRouteToPath('_layout.tsx')).toBeNull();
      expect(convertRemixRouteToPath('_auth.tsx')).toBeNull();
      expect(convertRemixRouteToPath('_middleware.tsx')).toBeNull();
      expect(convertRemixRouteToPath('_error.tsx')).toBeNull();
    });

    it('should NOT return null for _index routes', () => {
      // _index is special - it's the index route, not a pathless layout
      const result = convertRemixRouteToPath('_index.tsx');
      expect(result).not.toBeNull();
      expect(result?.path).toBe('/');
    });

    it('should handle pathless layouts with child routes correctly', () => {
      // _auth.login.tsx -> /login (only _auth is skipped)
      const result = convertRemixRouteToPath('_auth.login.tsx');
      expect(result).not.toBeNull();
      expect(result?.path).toBe('/login');
    });

    it('should handle nested pathless layouts correctly', () => {
      // users._layout.profile.tsx -> /users/profile (only _layout is skipped)
      const result = convertRemixRouteToPath('users._layout.profile.tsx');
      expect(result).not.toBeNull();
      expect(result?.path).toBe('/users/profile');
    });
  });
});
