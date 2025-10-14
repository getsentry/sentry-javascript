// mock helper functions not tested directly in this file
import './mocks';
import * as fs from 'fs';
import { describe, expect, it, vi } from 'vitest';
import type { ModuleRuleUseProperty, WebpackModuleRule } from '../../src/config/types';
import {
  clientBuildContext,
  clientWebpackConfig,
  exportedNextConfig,
  serverBuildContext,
  serverWebpackConfig,
} from './fixtures';
import { materializeFinalWebpackConfig } from './testUtils';

const existsSyncSpy = vi.spyOn(fs, 'existsSync');
const lstatSyncSpy = vi.spyOn(fs, 'lstatSync');

function applyRuleToResource(rule: WebpackModuleRule, resourcePath: string): ModuleRuleUseProperty[] {
  const applications = [];

  let shouldApply: boolean = false;
  if (typeof rule.test === 'function') {
    shouldApply = rule.test(resourcePath);
  } else if (rule.test instanceof RegExp) {
    shouldApply = !!resourcePath.match(rule.test);
  } else if (rule.test) {
    shouldApply = resourcePath === rule.test;
  }

  if (shouldApply) {
    if (Array.isArray(rule.use)) {
      applications.push(...rule.use);
    } else if (rule.use) {
      applications.push(rule.use);
    }
  }

  return applications;
}

describe('webpack loaders', () => {
  describe('server loaders', () => {
    it('adds server `valueInjection` loader to server config', async () => {
      const finalWebpackConfig = await materializeFinalWebpackConfig({
        exportedNextConfig,
        incomingWebpackConfig: serverWebpackConfig,
        incomingWebpackBuildContext: serverBuildContext,
      });

      expect(finalWebpackConfig.module.rules).toContainEqual({
        test: expect.any(RegExp),
        use: [
          {
            loader: expect.stringMatching(/valueInjectionLoader\.js$/),
            // We use `expect.objectContaining({})` rather than `expect.any(Object)` to match any plain object because
            // the latter will also match arrays, regexes, dates, sets, etc. - anything whose `typeof` value is
            // `'object'`.
            options: expect.objectContaining({ values: expect.objectContaining({}) }),
          },
        ],
      });
    });

    // For these tests we assume that we have an app and pages folder in {rootdir}/src
    it.each([
      {
        resourcePath: '/Users/Maisey/projects/squirrelChasingSimulator/src/pages/testPage.tsx',
        expectedWrappingTargetKind: 'page',
      },
      {
        resourcePath: '/Users/Maisey/projects/squirrelChasingSimulator/src/pages/testPage.custom.tsx',
        expectedWrappingTargetKind: 'page',
      },
      {
        resourcePath: './src/pages/testPage.tsx',
        expectedWrappingTargetKind: 'page',
      },
      {
        resourcePath: './pages/testPage.tsx',
        expectedWrappingTargetKind: undefined,
      },
      {
        resourcePath: '../src/pages/testPage.tsx',
        expectedWrappingTargetKind: undefined,
      },
      {
        resourcePath: '/Users/Maisey/projects/squirrelChasingSimulator/src/pages/nested/testPage.ts',
        expectedWrappingTargetKind: 'page',
      },
      {
        resourcePath: '/Users/Maisey/projects/squirrelChasingSimulator/src/pages/nested/testPage.js',
        expectedWrappingTargetKind: 'page',
      },
      {
        resourcePath: '/Users/Maisey/projects/squirrelChasingSimulator/src/pages/[nested]/[testPage].js',
        expectedWrappingTargetKind: 'page',
      },
      {
        resourcePath: '/Users/Maisey/projects/squirrelChasingSimulator/src/pages/[...testPage].js',
        expectedWrappingTargetKind: 'page',
      },
      // Regression test for https://github.com/getsentry/sentry-javascript/issues/7122
      {
        resourcePath: '/Users/Maisey/projects/squirrelChasingSimulator/src/pages/apidoc/[version].tsx',
        expectedWrappingTargetKind: 'page',
      },
      {
        resourcePath: '/Users/Maisey/projects/squirrelChasingSimulator/src/middleware.js',
        expectedWrappingTargetKind: 'middleware',
      },
      {
        resourcePath: '/Users/Maisey/projects/squirrelChasingSimulator/src/middleware.custom.js',
        expectedWrappingTargetKind: 'middleware',
      },
      {
        resourcePath: './src/middleware.js',
        expectedWrappingTargetKind: 'middleware',
      },
      {
        resourcePath: './middleware.js',
        expectedWrappingTargetKind: undefined,
      },
      {
        resourcePath: '/Users/Maisey/projects/squirrelChasingSimulator/src/middleware.ts',
        expectedWrappingTargetKind: 'middleware',
      },
      // Since we assume we have a pages file in src middleware will only be included in the build if it is also in src
      {
        resourcePath: '/Users/Maisey/projects/squirrelChasingSimulator/middleware.tsx',
        expectedWrappingTargetKind: undefined,
      },
      // Next.js 16+ renamed middleware to proxy
      {
        resourcePath: '/Users/Maisey/projects/squirrelChasingSimulator/src/proxy.js',
        expectedWrappingTargetKind: 'middleware',
      },
      {
        resourcePath: '/Users/Maisey/projects/squirrelChasingSimulator/src/proxy.ts',
        expectedWrappingTargetKind: 'middleware',
      },
      {
        resourcePath: './src/proxy.ts',
        expectedWrappingTargetKind: 'middleware',
      },
      {
        resourcePath: '/Users/Maisey/projects/squirrelChasingSimulator/src/proxy.tsx',
        expectedWrappingTargetKind: 'middleware',
      },
      {
        resourcePath: '/Users/Maisey/projects/squirrelChasingSimulator/proxy.tsx',
        expectedWrappingTargetKind: undefined,
      },
      {
        resourcePath: '/Users/Maisey/projects/squirrelChasingSimulator/src/pages/api/testApiRoute.ts',
        expectedWrappingTargetKind: 'api-route',
      },
      {
        resourcePath: './src/pages/api/testApiRoute.ts',
        expectedWrappingTargetKind: 'api-route',
      },
      {
        resourcePath: '/Users/Maisey/projects/squirrelChasingSimulator/src/pages/api/nested/testApiRoute.js',
        expectedWrappingTargetKind: 'api-route',
      },
      {
        resourcePath: '/Users/Maisey/projects/squirrelChasingSimulator/src/pages/api/nested/testApiRoute.custom.js',
        expectedWrappingTargetKind: 'api-route',
      },
      {
        resourcePath: '/Users/Maisey/projects/squirrelChasingSimulator/src/app/nested/route.ts',
        expectedWrappingTargetKind: 'route-handler',
      },
      {
        resourcePath: '/Users/Maisey/projects/squirrelChasingSimulator/src/app/nested/route.custom.ts',
        expectedWrappingTargetKind: 'route-handler',
      },
      {
        resourcePath: '/Users/Maisey/projects/squirrelChasingSimulator/src/app/page.js',
        expectedWrappingTargetKind: 'server-component',
      },
      {
        resourcePath: '/Users/Maisey/projects/squirrelChasingSimulator/src/app/page.custom.js',
        expectedWrappingTargetKind: 'server-component',
      },
      {
        resourcePath: '/Users/Maisey/projects/squirrelChasingSimulator/src/app/nested/page.js',
        expectedWrappingTargetKind: 'server-component',
      },
      {
        resourcePath: '/Users/Maisey/projects/squirrelChasingSimulator/src/app/nested/page.ts',
        expectedWrappingTargetKind: 'server-component',
      },
      {
        resourcePath: '/Users/Maisey/projects/squirrelChasingSimulator/src/app/(group)/nested/page.tsx',
        expectedWrappingTargetKind: 'server-component',
      },
      {
        resourcePath: '/Users/Maisey/projects/squirrelChasingSimulator/src/app/(group)/nested/loading.ts',
        expectedWrappingTargetKind: 'server-component',
      },
      {
        resourcePath: '/Users/Maisey/projects/squirrelChasingSimulator/src/app/layout.js',
        expectedWrappingTargetKind: 'server-component',
      },
    ])(
      'should apply the right wrappingTargetKind with wrapping loader ($resourcePath)',
      async ({ resourcePath, expectedWrappingTargetKind }) => {
        // We assume that we have an app and pages folder in {rootdir}/src
        existsSyncSpy.mockImplementation(path => {
          if (
            path.toString().startsWith('/Users/Maisey/projects/squirrelChasingSimulator/app') ||
            path.toString().startsWith('/Users/Maisey/projects/squirrelChasingSimulator/pages')
          ) {
            return false;
          }
          return true;
        });

        // @ts-expect-error Too lazy to mock the entire thing
        lstatSyncSpy.mockImplementation(() => ({
          isDirectory: () => true,
        }));

        const finalWebpackConfig = await materializeFinalWebpackConfig({
          exportedNextConfig,
          incomingWebpackConfig: serverWebpackConfig,
          incomingWebpackBuildContext: serverBuildContext,
        });

        const loaderApplications: ModuleRuleUseProperty[] = [];
        finalWebpackConfig.module.rules.forEach(rule => {
          loaderApplications.push(...applyRuleToResource(rule, resourcePath));
        });

        if (expectedWrappingTargetKind) {
          expect(loaderApplications).toContainEqual(
            expect.objectContaining({
              loader: expect.stringMatching(/wrappingLoader\.js$/),
              options: expect.objectContaining({
                wrappingTargetKind: expectedWrappingTargetKind,
              }),
            }),
          );
        } else {
          expect(loaderApplications).not.toContainEqual(
            expect.objectContaining({
              loader: expect.stringMatching(/wrappingLoader\.js$/),
            }),
          );
        }
      },
    );
  });

  describe('client loaders', () => {
    it('adds `valueInjection` loader to client config', async () => {
      const finalWebpackConfig = await materializeFinalWebpackConfig({
        exportedNextConfig,
        incomingWebpackConfig: clientWebpackConfig,
        incomingWebpackBuildContext: clientBuildContext,
      });

      expect(finalWebpackConfig.module.rules).toContainEqual({
        test: /(?:sentry\.client\.config\.(jsx?|tsx?)|(?:src[\\/])?instrumentation-client\.(js|ts))$/,
        use: [
          {
            loader: expect.stringMatching(/valueInjectionLoader\.js$/),
            // We use `expect.objectContaining({})` rather than `expect.any(Object)` to match any plain object because
            // the latter will also match arrays, regexes, dates, sets, etc. - anything whose `typeof` value is
            // `'object'`.
            options: expect.objectContaining({ values: expect.objectContaining({}) }),
          },
        ],
      });
    });
  });
});

describe('`distDir` value in default server-side `RewriteFrames` integration', () => {
  it('`RewriteFrames` ends up with correct `distDir` value', () => {
    // TODO: this, along with any number of other parts of the build process, should be tested with an integration
    // test which actually runs webpack and inspects the resulting bundles (and that integration test should test
    // custom `distDir` values with and without a `.`, to make sure the regex
    // escaping is working)
  });
});
