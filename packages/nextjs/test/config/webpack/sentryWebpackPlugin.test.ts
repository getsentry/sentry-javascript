import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { BuildContext } from '../../../src/config/types';
import { getUserConfigFile, getWebpackPluginOptions, SentryWebpackPlugin } from '../../../src/config/webpack';
import {
  clientBuildContext,
  clientWebpackConfig,
  exportedNextConfig,
  getBuildContext,
  serverBuildContext,
  serverWebpackConfig,
  userSentryWebpackPluginConfig,
} from '../fixtures';
import { exitsSync, mkdtempSyncSpy, mockExistsSync, realExistsSync } from '../mocks';
import { findWebpackPlugin, materializeFinalNextConfig, materializeFinalWebpackConfig } from '../testUtils';

describe('Sentry webpack plugin config', () => {
  it('includes expected properties', async () => {
    // also, can pull from either env or user config (see notes on specific properties below)
    const finalWebpackConfig = await materializeFinalWebpackConfig({
      exportedNextConfig,
      userSentryWebpackPluginConfig,
      incomingWebpackConfig: serverWebpackConfig,
      incomingWebpackBuildContext: serverBuildContext,
    });
    const sentryWebpackPluginInstance = findWebpackPlugin(finalWebpackConfig, 'SentryCliPlugin') as SentryWebpackPlugin;

    expect(sentryWebpackPluginInstance.options).toEqual(
      expect.objectContaining({
        include: expect.any(Array), // default, tested separately elsewhere
        ignore: [], // default
        org: 'squirrelChasers', // from user webpack plugin config
        project: 'simulator', // from user webpack plugin config
        authToken: 'dogsarebadatkeepingsecrets', // picked up from env
        stripPrefix: ['webpack://_N_E/'], // default
        urlPrefix: '~/_next', // default
        entries: expect.any(Function), // default, tested separately elsewhere
        release: 'doGsaREgReaT', // picked up from env
        dryRun: false, // based on buildContext.dev being false
      }),
    );
  });

  it('preserves unrelated plugin config options', async () => {
    const finalWebpackConfig = await materializeFinalWebpackConfig({
      exportedNextConfig,
      userSentryWebpackPluginConfig: { ...userSentryWebpackPluginConfig, debug: true },
      incomingWebpackConfig: serverWebpackConfig,
      incomingWebpackBuildContext: serverBuildContext,
    });
    const sentryWebpackPluginInstance = findWebpackPlugin(finalWebpackConfig, 'SentryCliPlugin') as SentryWebpackPlugin;

    expect(sentryWebpackPluginInstance.options.debug).toEqual(true);
  });

  it('warns when overriding certain default values', () => {
    // TODO
  });

  it("merges default include and ignore/ignoreFile options with user's values", () => {
    // do we even want to do this?
  });

  describe('Sentry webpack plugin `include` option', () => {
    it('has the correct value when building client bundles', async () => {
      const finalWebpackConfig = await materializeFinalWebpackConfig({
        exportedNextConfig,
        incomingWebpackConfig: clientWebpackConfig,
        incomingWebpackBuildContext: clientBuildContext,
      });

      const sentryWebpackPluginInstance = findWebpackPlugin(
        finalWebpackConfig,
        'SentryCliPlugin',
      ) as SentryWebpackPlugin;

      expect(sentryWebpackPluginInstance.options.include).toEqual([
        { paths: ['.next/static/chunks/pages'], urlPrefix: '~/_next/static/chunks/pages' },
      ]);
    });

    it('has the correct value when building client bundles using `widenClientFileUpload` option', async () => {
      const exportedNextConfigWithWidening = { ...exportedNextConfig, sentry: { widenClientFileUpload: true } };
      const finalWebpackConfig = await materializeFinalWebpackConfig({
        exportedNextConfig: exportedNextConfigWithWidening,
        incomingWebpackConfig: clientWebpackConfig,
        incomingWebpackBuildContext: getBuildContext('client', exportedNextConfigWithWidening),
      });

      const sentryWebpackPluginInstance = findWebpackPlugin(
        finalWebpackConfig,
        'SentryCliPlugin',
      ) as SentryWebpackPlugin;

      expect(sentryWebpackPluginInstance.options.include).toEqual([
        { paths: ['.next/static/chunks'], urlPrefix: '~/_next/static/chunks' },
      ]);
    });

    it('has the correct value when building serverless server bundles', async () => {
      const exportedNextConfigServerless = {
        ...exportedNextConfig,
        target: 'experimental-serverless-trace' as const,
      };

      const finalWebpackConfig = await materializeFinalWebpackConfig({
        exportedNextConfig: exportedNextConfigServerless,
        incomingWebpackConfig: serverWebpackConfig,
        incomingWebpackBuildContext: getBuildContext('server', exportedNextConfigServerless),
      });

      const sentryWebpackPluginInstance = findWebpackPlugin(
        finalWebpackConfig,
        'SentryCliPlugin',
      ) as SentryWebpackPlugin;

      expect(sentryWebpackPluginInstance.options.include).toEqual([
        { paths: ['.next/serverless/'], urlPrefix: '~/_next/serverless' },
      ]);
    });

    it('has the correct value when building serverful server bundles using webpack 4', async () => {
      const serverBuildContextWebpack4 = getBuildContext('server', exportedNextConfig);
      serverBuildContextWebpack4.webpack.version = '4.15.13';

      const finalWebpackConfig = await materializeFinalWebpackConfig({
        exportedNextConfig,
        incomingWebpackConfig: serverWebpackConfig,
        incomingWebpackBuildContext: serverBuildContextWebpack4,
      });

      const sentryWebpackPluginInstance = findWebpackPlugin(
        finalWebpackConfig,
        'SentryCliPlugin',
      ) as SentryWebpackPlugin;

      expect(sentryWebpackPluginInstance.options.include).toEqual([
        { paths: ['.next/server/pages/'], urlPrefix: '~/_next/server/pages' },
      ]);
    });

    it('has the correct value when building serverful server bundles using webpack 5', async () => {
      const finalWebpackConfig = await materializeFinalWebpackConfig({
        exportedNextConfig,
        incomingWebpackConfig: serverWebpackConfig,
        incomingWebpackBuildContext: serverBuildContext,
      });

      const sentryWebpackPluginInstance = findWebpackPlugin(
        finalWebpackConfig,
        'SentryCliPlugin',
      ) as SentryWebpackPlugin;

      expect(sentryWebpackPluginInstance.options.include).toEqual([
        { paths: ['.next/server/pages/'], urlPrefix: '~/_next/server/pages' },
        { paths: ['.next/server/chunks/'], urlPrefix: '~/_next/server/chunks' },
      ]);
    });
  });

  describe('Sentry webpack plugin `ignore` option', () => {
    it('has the correct value when building client bundles', async () => {
      const finalWebpackConfig = await materializeFinalWebpackConfig({
        exportedNextConfig,
        incomingWebpackConfig: clientWebpackConfig,
        incomingWebpackBuildContext: clientBuildContext,
      });

      const sentryWebpackPluginInstance = findWebpackPlugin(
        finalWebpackConfig,
        'SentryCliPlugin',
      ) as SentryWebpackPlugin;

      expect(sentryWebpackPluginInstance.options.ignore).toEqual([]);
    });

    it('has the correct value when building client bundles using `widenClientFileUpload` option', async () => {
      const exportedNextConfigWithWidening = { ...exportedNextConfig, sentry: { widenClientFileUpload: true } };
      const finalWebpackConfig = await materializeFinalWebpackConfig({
        exportedNextConfig: exportedNextConfigWithWidening,
        incomingWebpackConfig: clientWebpackConfig,
        incomingWebpackBuildContext: getBuildContext('client', exportedNextConfigWithWidening),
      });

      const sentryWebpackPluginInstance = findWebpackPlugin(
        finalWebpackConfig,
        'SentryCliPlugin',
      ) as SentryWebpackPlugin;

      expect(sentryWebpackPluginInstance.options.ignore).toEqual([
        'framework-*',
        'framework.*',
        'main-*',
        'polyfills-*',
        'webpack-*',
      ]);
    });
  });

  describe("Sentry webpack plugin `include` option with basePath filled on next's config", () => {
    const exportedNextConfigWithBasePath = {
      ...exportedNextConfig,
      basePath: '/city-park',
    };

    it('has the correct value when building client bundles', async () => {
      const finalWebpackConfig = await materializeFinalWebpackConfig({
        exportedNextConfig: exportedNextConfigWithBasePath,
        incomingWebpackConfig: clientWebpackConfig,
        incomingWebpackBuildContext: getBuildContext('client', exportedNextConfigWithBasePath),
      });

      const sentryWebpackPluginInstance = findWebpackPlugin(
        finalWebpackConfig,
        'SentryCliPlugin',
      ) as SentryWebpackPlugin;

      expect(sentryWebpackPluginInstance.options.include).toEqual([
        { paths: ['.next/static/chunks/pages'], urlPrefix: '~/city-park/_next/static/chunks/pages' },
      ]);
    });

    it('has the correct value when building serverless server bundles', async () => {
      const exportedNextConfigServerless = {
        ...exportedNextConfigWithBasePath,
        target: 'experimental-serverless-trace' as const,
      };

      const finalWebpackConfig = await materializeFinalWebpackConfig({
        exportedNextConfig: exportedNextConfigServerless,
        incomingWebpackConfig: serverWebpackConfig,
        incomingWebpackBuildContext: getBuildContext('server', exportedNextConfigServerless),
      });

      const sentryWebpackPluginInstance = findWebpackPlugin(
        finalWebpackConfig,
        'SentryCliPlugin',
      ) as SentryWebpackPlugin;

      expect(sentryWebpackPluginInstance.options.include).toEqual([
        { paths: ['.next/serverless/'], urlPrefix: '~/city-park/_next/serverless' },
      ]);
    });

    it('has the correct value when building serverful server bundles using webpack 4', async () => {
      const serverBuildContextWebpack4 = getBuildContext('server', exportedNextConfigWithBasePath);
      serverBuildContextWebpack4.webpack.version = '4.15.13';

      const finalWebpackConfig = await materializeFinalWebpackConfig({
        exportedNextConfig: exportedNextConfigWithBasePath,
        incomingWebpackConfig: serverWebpackConfig,
        incomingWebpackBuildContext: serverBuildContextWebpack4,
      });

      const sentryWebpackPluginInstance = findWebpackPlugin(
        finalWebpackConfig,
        'SentryCliPlugin',
      ) as SentryWebpackPlugin;

      expect(sentryWebpackPluginInstance.options.include).toEqual([
        { paths: ['.next/server/pages/'], urlPrefix: '~/city-park/_next/server/pages' },
      ]);
    });

    it('has the correct value when building serverful server bundles using webpack 5', async () => {
      const finalWebpackConfig = await materializeFinalWebpackConfig({
        exportedNextConfig: exportedNextConfigWithBasePath,
        incomingWebpackConfig: serverWebpackConfig,
        incomingWebpackBuildContext: getBuildContext('server', exportedNextConfigWithBasePath),
      });

      const sentryWebpackPluginInstance = findWebpackPlugin(
        finalWebpackConfig,
        'SentryCliPlugin',
      ) as SentryWebpackPlugin;

      expect(sentryWebpackPluginInstance.options.include).toEqual([
        { paths: ['.next/server/pages/'], urlPrefix: '~/city-park/_next/server/pages' },
        { paths: ['.next/server/chunks/'], urlPrefix: '~/city-park/_next/server/chunks' },
      ]);
    });
  });

  describe('disabling SentryWebpackPlugin', () => {
    it('allows SentryWebpackPlugin to be turned off for client code (independent of server code)', () => {
      const clientFinalNextConfig = materializeFinalNextConfig({
        ...exportedNextConfig,
        sentry: { disableClientWebpackPlugin: true },
      });
      const clientFinalWebpackConfig = clientFinalNextConfig.webpack?.(clientWebpackConfig, clientBuildContext);

      const serverFinalNextConfig = materializeFinalNextConfig(exportedNextConfig, userSentryWebpackPluginConfig);
      const serverFinalWebpackConfig = serverFinalNextConfig.webpack?.(serverWebpackConfig, serverBuildContext);

      expect(clientFinalWebpackConfig?.plugins).not.toEqual(expect.arrayContaining([expect.any(SentryWebpackPlugin)]));
      expect(serverFinalWebpackConfig?.plugins).toEqual(expect.arrayContaining([expect.any(SentryWebpackPlugin)]));
    });
    it('allows SentryWebpackPlugin to be turned off for server code (independent of client code)', () => {
      const serverFinalNextConfig = materializeFinalNextConfig({
        ...exportedNextConfig,
        sentry: { disableServerWebpackPlugin: true },
      });
      const serverFinalWebpackConfig = serverFinalNextConfig.webpack?.(serverWebpackConfig, serverBuildContext);

      const clientFinalNextConfig = materializeFinalNextConfig(exportedNextConfig, userSentryWebpackPluginConfig);
      const clientFinalWebpackConfig = clientFinalNextConfig.webpack?.(clientWebpackConfig, clientBuildContext);

      expect(serverFinalWebpackConfig?.plugins).not.toEqual(expect.arrayContaining([expect.any(SentryWebpackPlugin)]));
      expect(clientFinalWebpackConfig?.plugins).toEqual(expect.arrayContaining([expect.any(SentryWebpackPlugin)]));
    });

    it("doesn't set devtool if webpack plugin is disabled", () => {
      const finalNextConfig = materializeFinalNextConfig({
        ...exportedNextConfig,
        webpack: () => ({ devtool: 'something-besides-source-map' } as any),
        sentry: { disableServerWebpackPlugin: true },
      });
      const finalWebpackConfig = finalNextConfig.webpack?.(serverWebpackConfig, serverBuildContext);

      expect(finalWebpackConfig?.devtool).not.toEqual('source-map');
    });
  });

  describe('getUserConfigFile', () => {
    let tempDir: string;

    beforeAll(() => {
      exitsSync.mockImplementation(realExistsSync);
    });

    beforeEach(() => {
      // these will get cleaned up by the file's overall `afterAll` function, and the `mkdtempSync` mock above ensures
      // that the location of the created folder is stored in `tempDir`
      const tempDirPathPrefix = path.join(os.tmpdir(), 'sentry-nextjs-test-');
      fs.mkdtempSync(tempDirPathPrefix);
      tempDir = mkdtempSyncSpy.mock.results[0].value;
    });

    afterAll(() => {
      exitsSync.mockImplementation(mockExistsSync);
    });

    it('successfully finds js files', () => {
      fs.writeFileSync(path.resolve(tempDir, 'sentry.server.config.js'), 'Dogs are great!');
      fs.writeFileSync(path.resolve(tempDir, 'sentry.client.config.js'), 'Squirrel!');

      expect(getUserConfigFile(tempDir, 'server')).toEqual('sentry.server.config.js');
      expect(getUserConfigFile(tempDir, 'client')).toEqual('sentry.client.config.js');
    });

    it('successfully finds ts files', () => {
      fs.writeFileSync(path.resolve(tempDir, 'sentry.server.config.ts'), 'Sit. Stay. Lie Down.');
      fs.writeFileSync(path.resolve(tempDir, 'sentry.client.config.ts'), 'Good dog!');

      expect(getUserConfigFile(tempDir, 'server')).toEqual('sentry.server.config.ts');
      expect(getUserConfigFile(tempDir, 'client')).toEqual('sentry.client.config.ts');
    });

    it('errors when files are missing', () => {
      expect(() => getUserConfigFile(tempDir, 'server')).toThrowError(
        `Cannot find 'sentry.server.config.ts' or 'sentry.server.config.js' in '${tempDir}'`,
      );
      expect(() => getUserConfigFile(tempDir, 'client')).toThrowError(
        `Cannot find 'sentry.client.config.ts' or 'sentry.client.config.js' in '${tempDir}'`,
      );
    });
  });

  describe('correct paths from `distDir` in WebpackPluginOptions', () => {
    it.each([
      [getBuildContext('client', {}), '.next'],
      [getBuildContext('server', { target: 'experimental-serverless-trace' }), '.next'], // serverless
      [getBuildContext('server', {}, '4'), '.next'],
      [getBuildContext('server', {}, '5'), '.next'],
    ])('`distDir` is not defined', (buildContext: BuildContext, expectedDistDir) => {
      const includePaths = getWebpackPluginOptions(
        buildContext,
        {}, // userPluginOptions
        {}, // userSentryOptions
      ).include as { paths: [] }[];

      for (const pathDescriptor of includePaths) {
        for (const path of pathDescriptor.paths) {
          expect(path).toMatch(new RegExp(`^${expectedDistDir}.*`));
        }
      }
    });

    it.each([
      [getBuildContext('client', { distDir: 'tmpDir' }), 'tmpDir'],
      [getBuildContext('server', { distDir: 'tmpDir', target: 'experimental-serverless-trace' }), 'tmpDir'], // serverless
      [getBuildContext('server', { distDir: 'tmpDir' }, '4'), 'tmpDir'],
      [getBuildContext('server', { distDir: 'tmpDir' }, '5'), 'tmpDir'],
    ])('`distDir` is defined', (buildContext: BuildContext, expectedDistDir) => {
      const includePaths = getWebpackPluginOptions(
        buildContext,
        {}, // userPluginOptions
        {}, // userSentryOptions
      ).include as { paths: [] }[];

      for (const pathDescriptor of includePaths) {
        for (const path of pathDescriptor.paths) {
          expect(path).toMatch(new RegExp(`^${expectedDistDir}.*`));
        }
      }
    });
  });
});
