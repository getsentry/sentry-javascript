import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it, vi } from 'vitest';
import type { LoaderThis } from '../../src/config/loaders/types';
import type { WrappingLoaderOptions } from '../../src/config/loaders/wrappingLoader';

vi.mock('fs', { spy: true });

const originalReadfileSync = fs.readFileSync;

vi.spyOn(fs, 'readFileSync').mockImplementation((filePath, options) => {
  if (filePath.toString().endsWith('/config/templates/apiWrapperTemplate.js')) {
    return originalReadfileSync(
      path.join(__dirname, '../../build/cjs/config/templates/apiWrapperTemplate.js'),
      options,
    );
  }

  if (filePath.toString().endsWith('/config/templates/pageWrapperTemplate.js')) {
    return originalReadfileSync(
      path.join(__dirname, '../../build/cjs/config/templates/pageWrapperTemplate.js'),
      options,
    );
  }

  if (filePath.toString().endsWith('/config/templates/middlewareWrapperTemplate.js')) {
    return originalReadfileSync(
      path.join(__dirname, '../../build/cjs/config/templates/middlewareWrapperTemplate.js'),
      options,
    );
  }

  if (filePath.toString().endsWith('/config/templates/sentryInitWrapperTemplate.js')) {
    return originalReadfileSync(
      path.join(__dirname, '../../build/cjs/config/templates/sentryInitWrapperTemplate.js'),
      options,
    );
  }

  if (filePath.toString().endsWith('/config/templates/serverComponentWrapperTemplate.js')) {
    return originalReadfileSync(
      path.join(__dirname, '../../build/cjs/config/templates/serverComponentWrapperTemplate.js'),
      options,
    );
  }

  if (filePath.toString().endsWith('/config/templates/routeHandlerWrapperTemplate.js')) {
    return originalReadfileSync(
      path.join(__dirname, '../../build/cjs/config/templates/routeHandlerWrapperTemplate.js'),
      options,
    );
  }

  return originalReadfileSync(filePath, options);
});

const { default: wrappingLoader } = await import('../../src/config/loaders/wrappingLoader');

const DEFAULT_PAGE_EXTENSION_REGEX = ['tsx', 'ts', 'jsx', 'js'].join('|');

const defaultLoaderThis = {
  addDependency: () => undefined,
  async: () => undefined,
  cacheable: () => undefined,
};

describe('wrappingLoader', () => {
  it('should correctly wrap API routes on unix', async () => {
    const callback = vi.fn();

    const userCode = `
      export default function handler(req, res) {
        res.json({ foo: "bar" });
      }
    `;
    const userCodeSourceMap = undefined;

    const loaderPromise = new Promise<void>(resolve => {
      const loaderThis = {
        ...defaultLoaderThis,
        resourcePath: '/my/pages/my/route.ts',
        callback: callback.mockImplementation(() => {
          resolve();
        }),
        getOptions() {
          return {
            pagesDir: '/my/pages',
            appDir: '/my/app',
            pageExtensionRegex: DEFAULT_PAGE_EXTENSION_REGEX,
            excludeServerRoutes: [],
            wrappingTargetKind: 'api-route',
            vercelCronsConfig: undefined,
            nextjsRequestAsyncStorageModulePath: '/my/request-async-storage.js',
          };
        },
      } satisfies LoaderThis<WrappingLoaderOptions>;

      wrappingLoader.call(loaderThis, userCode, userCodeSourceMap);
    });

    await loaderPromise;

    expect(callback).toHaveBeenCalledWith(null, expect.stringContaining("'/my/route'"), expect.anything());
  });

  describe('middleware wrapping', () => {
    it('should export proxy when user exports named "proxy" export', async () => {
      const callback = vi.fn();

      const userCode = `
        export function proxy(request) {
          return new Response('ok');
        }
      `;
      const userCodeSourceMap = undefined;

      const loaderPromise = new Promise<void>(resolve => {
        const loaderThis = {
          ...defaultLoaderThis,
          resourcePath: '/my/src/proxy.ts',
          callback: callback.mockImplementation(() => {
            resolve();
          }),
          getOptions() {
            return {
              pagesDir: '/my/pages',
              appDir: '/my/app',
              pageExtensionRegex: DEFAULT_PAGE_EXTENSION_REGEX,
              excludeServerRoutes: [],
              wrappingTargetKind: 'middleware',
              vercelCronsConfig: undefined,
              nextjsRequestAsyncStorageModulePath: '/my/request-async-storage.js',
            };
          },
        } satisfies LoaderThis<WrappingLoaderOptions>;

        wrappingLoader.call(loaderThis, userCode, userCodeSourceMap);
      });

      await loaderPromise;

      const wrappedCode = callback.mock.calls[0][1];

      // Verify both exports are present in export statement (Rollup bundles this way)
      expect(wrappedCode).toMatch(/export \{[^}]*\bmiddleware\b[^}]*\bproxy\b[^}]*\}/);

      // Should detect proxy export
      expect(wrappedCode).toContain('userProvidedProxy = true');

      // Proxy should be wrapped, middleware should be undefined
      expect(wrappedCode).toMatch(/const proxy = userProvidedProxy \? wrappedHandler : undefined/);
      expect(wrappedCode).toMatch(/const middleware = userProvidedMiddleware \? wrappedHandler : undefined/);
    });

    it('should export middleware when user exports named "middleware" export', async () => {
      const callback = vi.fn();

      const userCode = `
        export function middleware(request) {
          return new Response('ok');
        }
      `;
      const userCodeSourceMap = undefined;

      const loaderPromise = new Promise<void>(resolve => {
        const loaderThis = {
          ...defaultLoaderThis,
          resourcePath: '/my/src/middleware.ts',
          callback: callback.mockImplementation(() => {
            resolve();
          }),
          getOptions() {
            return {
              pagesDir: '/my/pages',
              appDir: '/my/app',
              pageExtensionRegex: DEFAULT_PAGE_EXTENSION_REGEX,
              excludeServerRoutes: [],
              wrappingTargetKind: 'middleware',
              vercelCronsConfig: undefined,
              nextjsRequestAsyncStorageModulePath: '/my/request-async-storage.js',
            };
          },
        } satisfies LoaderThis<WrappingLoaderOptions>;

        wrappingLoader.call(loaderThis, userCode, userCodeSourceMap);
      });

      await loaderPromise;

      const wrappedCode = callback.mock.calls[0][1];

      // Should detect middleware export
      expect(wrappedCode).toContain('userProvidedMiddleware = true');

      // Should NOT detect proxy export
      expect(wrappedCode).toContain('userProvidedProxy = false');

      // Middleware should be wrapped, proxy should be undefined
      expect(wrappedCode).toMatch(/const middleware = userProvidedMiddleware \? wrappedHandler : undefined/);
      expect(wrappedCode).toMatch(/const proxy = userProvidedProxy \? wrappedHandler : undefined/);
    });

    it('should export undefined middleware/proxy when user only exports default', async () => {
      const callback = vi.fn();

      const userCode = `
        export default function(request) {
          return new Response('ok');
        }
      `;
      const userCodeSourceMap = undefined;

      const loaderPromise = new Promise<void>(resolve => {
        const loaderThis = {
          ...defaultLoaderThis,
          resourcePath: '/my/src/middleware.ts',
          callback: callback.mockImplementation(() => {
            resolve();
          }),
          getOptions() {
            return {
              pagesDir: '/my/pages',
              appDir: '/my/app',
              pageExtensionRegex: DEFAULT_PAGE_EXTENSION_REGEX,
              excludeServerRoutes: [],
              wrappingTargetKind: 'middleware',
              vercelCronsConfig: undefined,
              nextjsRequestAsyncStorageModulePath: '/my/request-async-storage.js',
            };
          },
        } satisfies LoaderThis<WrappingLoaderOptions>;

        wrappingLoader.call(loaderThis, userCode, userCodeSourceMap);
      });

      await loaderPromise;

      const wrappedCode = callback.mock.calls[0][1];

      // Should export default
      expect(wrappedCode).toMatch(/export \{[^}]* as default[^}]*\}/);

      // Both flags should be false (no named exports provided by user)
      expect(wrappedCode).toContain('userProvidedMiddleware = false');
      expect(wrappedCode).toContain('userProvidedProxy = false');

      // Both middleware and proxy should be undefined (conditionals evaluate to false)
      expect(wrappedCode).toMatch(/const middleware = userProvidedMiddleware \? wrappedHandler : undefined/);
      expect(wrappedCode).toMatch(/const proxy = userProvidedProxy \? wrappedHandler : undefined/);
    });
  });

  describe('sourcemap handling', () => {
    it('should include inline sourcemap in dev mode', async () => {
      const callback = vi.fn();

      const userCode = `
        export function middleware(request) {
          return new Response('ok');
        }
      `;
      const userCodeSourceMap = undefined;

      const loaderPromise = new Promise<void>(resolve => {
        const loaderThis = {
          ...defaultLoaderThis,
          resourcePath: '/my/src/middleware.ts',
          callback: callback.mockImplementation(() => {
            resolve();
          }),
          getOptions() {
            return {
              pagesDir: '/my/pages',
              appDir: '/my/app',
              pageExtensionRegex: DEFAULT_PAGE_EXTENSION_REGEX,
              excludeServerRoutes: [],
              wrappingTargetKind: 'middleware',
              vercelCronsConfig: undefined,
              nextjsRequestAsyncStorageModulePath: '/my/request-async-storage.js',
              isDev: true,
            };
          },
        } satisfies LoaderThis<WrappingLoaderOptions>;

        wrappingLoader.call(loaderThis, userCode, userCodeSourceMap);
      });

      await loaderPromise;

      const wrappedCode = callback.mock.calls[0][1] as string;

      // In dev mode, should have inline sourcemap for debugger support
      expect(wrappedCode).toContain('//# sourceMappingURL=data:application/json;charset=utf-8;base64,');
    });

    it('should not include inline sourcemap in production mode', async () => {
      const callback = vi.fn();

      const userCode = `
        export function middleware(request) {
          return new Response('ok');
        }
      `;
      const userCodeSourceMap = undefined;

      const loaderPromise = new Promise<void>(resolve => {
        const loaderThis = {
          ...defaultLoaderThis,
          resourcePath: '/my/src/middleware.ts',
          callback: callback.mockImplementation(() => {
            resolve();
          }),
          getOptions() {
            return {
              pagesDir: '/my/pages',
              appDir: '/my/app',
              pageExtensionRegex: DEFAULT_PAGE_EXTENSION_REGEX,
              excludeServerRoutes: [],
              wrappingTargetKind: 'middleware',
              vercelCronsConfig: undefined,
              nextjsRequestAsyncStorageModulePath: '/my/request-async-storage.js',
              isDev: false,
            };
          },
        } satisfies LoaderThis<WrappingLoaderOptions>;

        wrappingLoader.call(loaderThis, userCode, userCodeSourceMap);
      });

      await loaderPromise;

      const wrappedCode = callback.mock.calls[0][1] as string;

      // In production mode, should NOT have inline sourcemap (hidden sourcemap instead)
      expect(wrappedCode).not.toContain('//# sourceMappingURL=data:application/json;charset=utf-8;base64,');
    });
  });
});
