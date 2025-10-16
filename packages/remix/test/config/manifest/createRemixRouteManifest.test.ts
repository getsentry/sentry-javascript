import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterAll, describe, expect, it } from 'vitest';
import { createRemixRouteManifest } from '../../../src/config/createRemixRouteManifest';

describe('createRemixRouteManifest', () => {
  const tempDirs: string[] = [];

  function createTestDir(): { tempDir: string; appDir: string; routesDir: string } {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remix-test-'));
    const appDir = path.join(tempDir, 'app');
    const routesDir = path.join(appDir, 'routes');
    fs.mkdirSync(routesDir, { recursive: true });
    tempDirs.push(tempDir);
    return { tempDir, appDir, routesDir };
  }

  afterAll(() => {
    // Clean up all temporary directories
    tempDirs.forEach(dir => {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe('flat route structure', () => {
    it('should handle basic flat routes', () => {
      const { tempDir, routesDir } = createTestDir();

      // Create test route files
      fs.writeFileSync(path.join(routesDir, 'index.tsx'), '// index route');
      fs.writeFileSync(path.join(routesDir, 'about.tsx'), '// about route');
      fs.writeFileSync(path.join(routesDir, 'users.$id.tsx'), '// users dynamic route');

      const manifest = createRemixRouteManifest({ rootDir: tempDir });

      expect(manifest.staticRoutes).toHaveLength(2);
      expect(manifest.staticRoutes).toContainEqual({ path: '/' });
      expect(manifest.staticRoutes).toContainEqual({ path: '/about' });

      expect(manifest.dynamicRoutes).toHaveLength(1);
      expect(manifest.dynamicRoutes[0]).toMatchObject({
        path: '/users/:id',
        regex: '^/users/([^/]+)$',
        paramNames: ['id'],
      });

      // Clean up
      fs.unlinkSync(path.join(routesDir, 'index.tsx'));
      fs.unlinkSync(path.join(routesDir, 'about.tsx'));
      fs.unlinkSync(path.join(routesDir, 'users.$id.tsx'));
    });
  });

  describe('nested route structure', () => {
    it('should handle nested directory routes', () => {
      const { tempDir, routesDir } = createTestDir();
      const usersDir = path.join(routesDir, 'users');
      fs.mkdirSync(usersDir, { recursive: true });

      fs.writeFileSync(path.join(routesDir, 'index.tsx'), '// root index');
      fs.writeFileSync(path.join(usersDir, '$id.tsx'), '// user id');
      fs.writeFileSync(path.join(usersDir, 'index.tsx'), '// users index');

      const manifest = createRemixRouteManifest({ rootDir: tempDir });

      expect(manifest.staticRoutes).toContainEqual({ path: '/' });
      expect(manifest.staticRoutes).toContainEqual({ path: '/users' });

      expect(manifest.dynamicRoutes).toContainEqual(
        expect.objectContaining({
          path: '/users/:id',
          regex: '^/users/([^/]+)$',
          paramNames: ['id'],
        }),
      );
    });

    it('should handle deeply nested routes', () => {
      const { tempDir, routesDir } = createTestDir();
      const usersDir = path.join(routesDir, 'users');
      const userIdDir = path.join(usersDir, '$id');
      const postsDir = path.join(userIdDir, 'posts');

      fs.mkdirSync(postsDir, { recursive: true });

      fs.writeFileSync(path.join(userIdDir, 'index.tsx'), '// user index');
      fs.writeFileSync(path.join(postsDir, '$postId.tsx'), '// post id');

      const manifest = createRemixRouteManifest({ rootDir: tempDir });

      // users/$id/index.tsx should map to /users/:id (dynamic route)
      expect(manifest.dynamicRoutes).toContainEqual(
        expect.objectContaining({
          path: '/users/:id',
          regex: '^/users/([^/]+)$',
          paramNames: ['id'],
        }),
      );

      // users/$id/posts/$postId.tsx should map to /users/:id/posts/:postId
      expect(manifest.dynamicRoutes).toContainEqual(
        expect.objectContaining({
          path: '/users/:id/posts/:postId',
          regex: '^/users/([^/]+)/posts/([^/]+)$',
          paramNames: ['id', 'postId'],
        }),
      );
    });

    it('should handle mixed flat and nested routes', () => {
      const { tempDir, routesDir } = createTestDir();
      const usersDir = path.join(routesDir, 'users');
      fs.mkdirSync(usersDir, { recursive: true });

      fs.writeFileSync(path.join(routesDir, 'index.tsx'), '// root');
      fs.writeFileSync(path.join(routesDir, 'about.tsx'), '// about');
      fs.writeFileSync(path.join(usersDir, '$id.tsx'), '// user');

      const manifest = createRemixRouteManifest({ rootDir: tempDir });

      expect(manifest.staticRoutes).toContainEqual({ path: '/' });
      expect(manifest.staticRoutes).toContainEqual({ path: '/about' });

      expect(manifest.dynamicRoutes).toContainEqual(
        expect.objectContaining({
          path: '/users/:id',
          regex: '^/users/([^/]+)$',
          paramNames: ['id'],
        }),
      );
    });
  });
});
