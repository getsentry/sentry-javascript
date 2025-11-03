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
    it('should only export "proxy" when user exports named "proxy" export', async () => {
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

      // Verify both exports are present in the final export statement
      expect(wrappedCode).toMatch(/export \{[^}]*\bmiddleware\b[^}]*\bproxy\b[^}]*\}/);

      // Should wrap proxy (userProvidedProxy should be true)
      expect(wrappedCode).toContain('userProvidedProxy = true');
      expect(wrappedCode).toContain('const proxy = userProvidedProxy && userProvidedNamedHandler');

      // Should NOT wrap middleware (userProvidedMiddleware should remain false)
      expect(wrappedCode).toContain('userProvidedMiddleware = false');
      expect(wrappedCode).toContain('const middleware = userProvidedMiddleware && userProvidedNamedHandler');

      // Verify wrapMiddlewareWithSentry is called in the ternary
      expect(wrappedCode).toContain('Sentry.wrapMiddlewareWithSentry(userProvidedNamedHandler)');
    });

    it('should only export "middleware" when user exports named "middleware" export', async () => {
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

      // Verify both exports are present in the final export statement
      expect(wrappedCode).toMatch(/export \{[^}]*\bmiddleware\b[^}]*\bproxy\b[^}]*\}/);

      // Should wrap middleware (userProvidedMiddleware should be true)
      expect(wrappedCode).toContain('userProvidedMiddleware = true');
      expect(wrappedCode).toContain('const middleware = userProvidedMiddleware && userProvidedNamedHandler');

      // Should NOT wrap proxy (userProvidedProxy should remain false)
      expect(wrappedCode).toContain('userProvidedProxy = false');
      expect(wrappedCode).toContain('const proxy = userProvidedProxy && userProvidedNamedHandler');

      // Verify wrapMiddlewareWithSentry is called in the ternary
      expect(wrappedCode).toContain('Sentry.wrapMiddlewareWithSentry(userProvidedNamedHandler)');
    });

    it('should not export named exports when user only exports default', async () => {
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

      // Both named exports should evaluate to undefined (false && handler = undefined)
      expect(wrappedCode).toMatch(/const middleware = userProvidedMiddleware && userProvidedNamedHandler/);
      expect(wrappedCode).toMatch(/const proxy = userProvidedProxy && userProvidedNamedHandler/);
    });
  });
});
