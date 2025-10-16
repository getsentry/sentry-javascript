import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { Plugin, ResolvedConfig } from 'vite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sentryRemixVitePlugin } from '../../src/config/vite';

describe('sentryRemixVitePlugin', () => {
  let tempDir: string;
  let appDir: string;
  let routesDir: string;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Create a temporary directory for test fixtures
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vite-plugin-test-'));
    appDir = path.join(tempDir, 'app');
    routesDir = path.join(appDir, 'routes');
    fs.mkdirSync(routesDir, { recursive: true });

    // Spy on console methods
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // Clean up
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('plugin configuration', () => {
    it('should return a valid Vite plugin with correct name', () => {
      const plugin = sentryRemixVitePlugin();

      expect(plugin).toBeDefined();
      expect(plugin.name).toBe('sentry-remix-route-manifest');
      expect(plugin.enforce).toBe('post');
    });

    it('should accept custom appDirPath option', () => {
      const plugin = sentryRemixVitePlugin({ appDirPath: '/custom/path' });

      expect(plugin).toBeDefined();
    });

    it('should work with no options', () => {
      const plugin = sentryRemixVitePlugin();

      expect(plugin).toBeDefined();
    });
  });

  describe('configResolved hook', () => {
    it('should generate route manifest from routes directory', () => {
      // Create test routes
      fs.writeFileSync(path.join(routesDir, 'index.tsx'), '// index');
      fs.writeFileSync(path.join(routesDir, 'about.tsx'), '// about');
      fs.writeFileSync(path.join(routesDir, 'users.$id.tsx'), '// users');

      const plugin = sentryRemixVitePlugin() as Plugin & {
        configResolved: (config: ResolvedConfig) => void;
      };

      const mockConfig: Partial<ResolvedConfig> = {
        root: tempDir,
        command: 'build',
        mode: 'production',
      };

      plugin.configResolved(mockConfig as ResolvedConfig);

      // Should not log in production mode
      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should log manifest info in development mode', () => {
      fs.writeFileSync(path.join(routesDir, 'index.tsx'), '// index');
      fs.writeFileSync(path.join(routesDir, 'users.$id.tsx'), '// users');

      const plugin = sentryRemixVitePlugin() as Plugin & {
        configResolved: (config: ResolvedConfig) => void;
      };

      const mockConfig: Partial<ResolvedConfig> = {
        root: tempDir,
        command: 'serve',
        mode: 'development',
      };

      plugin.configResolved(mockConfig as ResolvedConfig);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Sentry Remix] Found 1 static and 1 dynamic routes'),
      );
    });

    it('should handle errors gracefully and set empty manifest', () => {
      const plugin = sentryRemixVitePlugin({ appDirPath: '/nonexistent/path' }) as Plugin & {
        configResolved: (config: ResolvedConfig) => void;
      };

      const mockConfig: Partial<ResolvedConfig> = {
        root: tempDir,
        command: 'build',
        mode: 'production',
      };

      // Should not throw
      expect(() => plugin.configResolved(mockConfig as ResolvedConfig)).not.toThrow();

      // Should log error but not crash
      expect(consoleErrorSpy).not.toHaveBeenCalled(); // No error if directory doesn't exist
    });

    it('should use custom appDirPath when provided', () => {
      const customAppDir = path.join(tempDir, 'custom-app');
      const customRoutesDir = path.join(customAppDir, 'routes');
      fs.mkdirSync(customRoutesDir, { recursive: true });
      fs.writeFileSync(path.join(customRoutesDir, 'index.tsx'), '// index');

      const plugin = sentryRemixVitePlugin({ appDirPath: customAppDir }) as Plugin & {
        configResolved: (config: ResolvedConfig) => void;
      };

      const mockConfig: Partial<ResolvedConfig> = {
        root: tempDir,
        command: 'serve',
        mode: 'development',
      };

      plugin.configResolved(mockConfig as ResolvedConfig);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('[Sentry Remix] Found 1 static'));
    });
  });

  describe('transformIndexHtml hook', () => {
    it('should inject manifest into HTML with <head> tag', () => {
      fs.writeFileSync(path.join(routesDir, 'index.tsx'), '// index');

      const plugin = sentryRemixVitePlugin() as Plugin & {
        configResolved: (config: ResolvedConfig) => void;
        transformIndexHtml: {
          order: string;
          handler: (html: string) => string;
        };
      };

      const mockConfig: Partial<ResolvedConfig> = {
        root: tempDir,
        command: 'build',
        mode: 'production',
      };

      plugin.configResolved(mockConfig as ResolvedConfig);

      const html = '<html><head><title>Test</title></head><body></body></html>';
      const result = plugin.transformIndexHtml.handler(html);

      expect(result).toContain('<head>');
      expect(result).toContain('window._sentryRemixRouteManifest');
      expect(result).toContain('<script>');
      expect(result).toMatch(/<head>\s*<script>/);
    });

    it('should handle HTML without <head> tag by creating one', () => {
      fs.writeFileSync(path.join(routesDir, 'index.tsx'), '// index');

      const plugin = sentryRemixVitePlugin() as Plugin & {
        configResolved: (config: ResolvedConfig) => void;
        transformIndexHtml: {
          order: string;
          handler: (html: string) => string;
        };
      };

      const mockConfig: Partial<ResolvedConfig> = {
        root: tempDir,
        command: 'build',
        mode: 'production',
      };

      plugin.configResolved(mockConfig as ResolvedConfig);

      const html = '<html><body>Content</body></html>';
      const result = plugin.transformIndexHtml.handler(html);

      expect(result).toContain('<head>');
      expect(result).toContain('window._sentryRemixRouteManifest');
    });

    it('should handle HTML with uppercase <HEAD> tag', () => {
      fs.writeFileSync(path.join(routesDir, 'index.tsx'), '// index');

      const plugin = sentryRemixVitePlugin() as Plugin & {
        configResolved: (config: ResolvedConfig) => void;
        transformIndexHtml: {
          order: string;
          handler: (html: string) => string;
        };
      };

      const mockConfig: Partial<ResolvedConfig> = {
        root: tempDir,
        command: 'build',
        mode: 'production',
      };

      plugin.configResolved(mockConfig as ResolvedConfig);

      const html = '<HTML><HEAD><TITLE>Test</TITLE></HEAD><BODY></BODY></HTML>';
      const result = plugin.transformIndexHtml.handler(html);

      expect(result).toContain('window._sentryRemixRouteManifest');
    });

    it('should handle minimal HTML by wrapping it', () => {
      fs.writeFileSync(path.join(routesDir, 'index.tsx'), '// index');

      const plugin = sentryRemixVitePlugin() as Plugin & {
        configResolved: (config: ResolvedConfig) => void;
        transformIndexHtml: {
          order: string;
          handler: (html: string) => string;
        };
      };

      const mockConfig: Partial<ResolvedConfig> = {
        root: tempDir,
        command: 'build',
        mode: 'production',
      };

      plugin.configResolved(mockConfig as ResolvedConfig);

      const html = '<div>Content</div>';
      const result = plugin.transformIndexHtml.handler(html);

      expect(result).toContain('<!DOCTYPE html>');
      expect(result).toContain('<head>');
      expect(result).toContain('window._sentryRemixRouteManifest');
    });

    it('should properly escape manifest JSON', () => {
      // Create a route that might have special characters
      fs.writeFileSync(path.join(routesDir, 'test.tsx'), '// test');

      const plugin = sentryRemixVitePlugin() as Plugin & {
        configResolved: (config: ResolvedConfig) => void;
        transformIndexHtml: {
          order: string;
          handler: (html: string) => string;
        };
      };

      const mockConfig: Partial<ResolvedConfig> = {
        root: tempDir,
        command: 'build',
        mode: 'production',
      };

      plugin.configResolved(mockConfig as ResolvedConfig);

      const html = '<html><head></head><body></body></html>';
      const result = plugin.transformIndexHtml.handler(html);

      // Check that the JSON is properly escaped (no unescaped quotes that would break JS)
      expect(result).toMatch(/window\._sentryRemixRouteManifest = "[^"]*"/);
    });
  });

  describe('transform hook', () => {
    it('should inject manifest into entry.client.tsx file', () => {
      fs.writeFileSync(path.join(routesDir, 'index.tsx'), '// index');

      const plugin = sentryRemixVitePlugin() as Plugin & {
        configResolved: (config: ResolvedConfig) => void;
        transform: (code: string, id: string) => { code: string; map: null } | null;
      };

      const mockConfig: Partial<ResolvedConfig> = {
        root: tempDir,
        command: 'build',
        mode: 'production',
      };

      plugin.configResolved(mockConfig as ResolvedConfig);

      const code = 'console.log("entry client");';
      const id = '/app/entry.client.tsx';
      const result = plugin.transform(code, id);

      expect(result).not.toBeNull();
      expect(result?.code).toContain('window._sentryRemixRouteManifest');
      expect(result?.code).toContain(code);
      expect(result?.code).toContain("typeof window !== 'undefined'");
    });

    it('should inject manifest into entry-client.ts file', () => {
      fs.writeFileSync(path.join(routesDir, 'index.tsx'), '// index');

      const plugin = sentryRemixVitePlugin() as Plugin & {
        configResolved: (config: ResolvedConfig) => void;
        transform: (code: string, id: string) => { code: string; map: null } | null;
      };

      const mockConfig: Partial<ResolvedConfig> = {
        root: tempDir,
        command: 'build',
        mode: 'production',
      };

      plugin.configResolved(mockConfig as ResolvedConfig);

      const code = 'console.log("entry client");';
      const id = '/app/entry-client.ts';
      const result = plugin.transform(code, id);

      expect(result).not.toBeNull();
      expect(result?.code).toContain('window._sentryRemixRouteManifest');
    });

    it('should not inject into non-entry files', () => {
      fs.writeFileSync(path.join(routesDir, 'index.tsx'), '// index');

      const plugin = sentryRemixVitePlugin() as Plugin & {
        configResolved: (config: ResolvedConfig) => void;
        transform: (code: string, id: string) => { code: string; map: null } | null;
      };

      const mockConfig: Partial<ResolvedConfig> = {
        root: tempDir,
        command: 'build',
        mode: 'production',
      };

      plugin.configResolved(mockConfig as ResolvedConfig);

      const code = 'console.log("some file");';
      const id = '/app/routes/index.tsx';
      const result = plugin.transform(code, id);

      expect(result).toBeNull();
    });

    it('should not inject into entry.server.tsx', () => {
      fs.writeFileSync(path.join(routesDir, 'index.tsx'), '// index');

      const plugin = sentryRemixVitePlugin() as Plugin & {
        configResolved: (config: ResolvedConfig) => void;
        transform: (code: string, id: string) => { code: string; map: null } | null;
      };

      const mockConfig: Partial<ResolvedConfig> = {
        root: tempDir,
        command: 'build',
        mode: 'production',
      };

      plugin.configResolved(mockConfig as ResolvedConfig);

      const code = 'console.log("entry server");';
      const id = '/app/entry.server.tsx';
      const result = plugin.transform(code, id);

      expect(result).toBeNull();
    });

    it('should handle files with "entry.client" in path', () => {
      fs.writeFileSync(path.join(routesDir, 'index.tsx'), '// index');

      const plugin = sentryRemixVitePlugin() as Plugin & {
        configResolved: (config: ResolvedConfig) => void;
        transform: (code: string, id: string) => { code: string; map: null } | null;
      };

      const mockConfig: Partial<ResolvedConfig> = {
        root: tempDir,
        command: 'build',
        mode: 'production',
      };

      plugin.configResolved(mockConfig as ResolvedConfig);

      const code = 'console.log("entry client");';
      const id = '/some/path/entry.client.js';
      const result = plugin.transform(code, id);

      expect(result).not.toBeNull();
      expect(result?.code).toContain('window._sentryRemixRouteManifest');
    });

    it('should not double-inject if transformIndexHtml already ran', () => {
      fs.writeFileSync(path.join(routesDir, 'index.tsx'), '// index');

      const plugin = sentryRemixVitePlugin() as Plugin & {
        configResolved: (config: ResolvedConfig) => void;
        transform: (code: string, id: string) => { code: string; map: null } | null;
      };

      const mockConfig: Partial<ResolvedConfig> = {
        root: tempDir,
        command: 'build',
        mode: 'production',
      };

      plugin.configResolved(mockConfig as ResolvedConfig);

      const code = 'console.log("entry client");';
      const id = '/app/entry.client.tsx';
      const result = plugin.transform(code, id);

      // Should have conditional check to avoid overwriting
      expect(result?.code).toMatch(/window\._sentryRemixRouteManifest = window\._sentryRemixRouteManifest \|\|/);
    });
  });

  describe('manifest content', () => {
    it('should include both static and dynamic routes in manifest', () => {
      fs.writeFileSync(path.join(routesDir, 'index.tsx'), '// index');
      fs.writeFileSync(path.join(routesDir, 'about.tsx'), '// about');
      fs.writeFileSync(path.join(routesDir, 'users.$id.tsx'), '// users');

      const plugin = sentryRemixVitePlugin() as Plugin & {
        configResolved: (config: ResolvedConfig) => void;
        transformIndexHtml: {
          order: string;
          handler: (html: string) => string;
        };
      };

      const mockConfig: Partial<ResolvedConfig> = {
        root: tempDir,
        command: 'build',
        mode: 'production',
      };

      plugin.configResolved(mockConfig as ResolvedConfig);

      const html = '<html><head></head><body></body></html>';
      const result = plugin.transformIndexHtml.handler(html);

      // Extract the manifest from the result
      // The manifest is double-stringified: once by createRemixRouteManifest, then again for injection
      const match = result.match(/window\._sentryRemixRouteManifest = (".*?");/);
      expect(match).toBeTruthy();

      if (match?.[1]) {
        // First parse to get the JSON string, then parse again to get the object
        const manifestJsonString = JSON.parse(match[1]);
        const manifest = JSON.parse(manifestJsonString);

        expect(manifest.staticRoutes).toHaveLength(2);
        expect(manifest.dynamicRoutes).toHaveLength(1);
        expect(manifest.dynamicRoutes[0].path).toBe('/users/:id');
      }
    });

    it('should handle nested routes in manifest', () => {
      const usersDir = path.join(routesDir, 'users');
      fs.mkdirSync(usersDir);
      fs.writeFileSync(path.join(usersDir, '$id.tsx'), '// user');

      const plugin = sentryRemixVitePlugin() as Plugin & {
        configResolved: (config: ResolvedConfig) => void;
        transformIndexHtml: {
          order: string;
          handler: (html: string) => string;
        };
      };

      const mockConfig: Partial<ResolvedConfig> = {
        root: tempDir,
        command: 'build',
        mode: 'production',
      };

      plugin.configResolved(mockConfig as ResolvedConfig);

      const html = '<html><head></head><body></body></html>';
      const result = plugin.transformIndexHtml.handler(html);

      expect(result).toContain('window._sentryRemixRouteManifest');

      // Extract and verify the manifest contains the nested route
      // The manifest is double-stringified: once by createRemixRouteManifest, then again for injection
      const match = result.match(/window\._sentryRemixRouteManifest = (".*?");/);
      expect(match).toBeTruthy();

      if (match?.[1]) {
        // First parse to get the JSON string, then parse again to get the object
        const manifestJsonString = JSON.parse(match[1]);
        const manifest = JSON.parse(manifestJsonString);
        expect(manifest.dynamicRoutes).toHaveLength(1);
        expect(manifest.dynamicRoutes[0].path).toBe('/users/:id');
      }
    });
  });
});
