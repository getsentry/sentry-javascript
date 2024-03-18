import * as fs from 'fs';
import * as path from 'path';

const originalReadfileSync = fs.readFileSync;

jest.spyOn(fs, 'readFileSync').mockImplementation((filePath, options) => {
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

import type { LoaderThis } from '../../src/config/loaders/types';
import type { WrappingLoaderOptions } from '../../src/config/loaders/wrappingLoader';
import wrappingLoader from '../../src/config/loaders/wrappingLoader';

const DEFAULT_PAGE_EXTENSION_REGEX = ['tsx', 'ts', 'jsx', 'js'].join('|');

const defaultLoaderThis = {
  addDependency: () => undefined,
  async: () => undefined,
  cacheable: () => undefined,
};

describe('wrappingLoader', () => {
  it('should correctly wrap API routes on unix', async () => {
    const callback = jest.fn();

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
});
