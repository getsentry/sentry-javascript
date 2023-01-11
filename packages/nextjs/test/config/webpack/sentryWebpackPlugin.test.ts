import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type { BuildContext, ExportedNextConfig } from '../../../src/config/types';
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
import { findWebpackPlugin, materializeFinalWebpackConfig } from '../testUtils';

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
        { paths: [`${clientBuildContext.dir}/.next/static/chunks/pages`], urlPrefix: '~/_next/static/chunks/pages' },
      ]);
    });

    it('has the correct value when building client bundles using `widenClientFileUpload` option', async () => {
      const exportedNextConfigWithWidening = { ...exportedNextConfig, sentry: { widenClientFileUpload: true } };
      const buildContext = getBuildContext('client', exportedNextConfigWithWidening);

      const finalWebpackConfig = await materializeFinalWebpackConfig({
        exportedNextConfig: exportedNextConfigWithWidening,
        incomingWebpackConfig: clientWebpackConfig,
        incomingWebpackBuildContext: buildContext,
      });

      const sentryWebpackPluginInstance = findWebpackPlugin(
        finalWebpackConfig,
        'SentryCliPlugin',
      ) as SentryWebpackPlugin;

      expect(sentryWebpackPluginInstance.options.include).toEqual([
        { paths: [`${buildContext.dir}/.next/static/chunks`], urlPrefix: '~/_next/static/chunks' },
      ]);
    });

    it('has the correct value when building serverless server bundles', async () => {
      const exportedNextConfigServerless = {
        ...exportedNextConfig,
        target: 'experimental-serverless-trace' as const,
      };
      const buildContext = getBuildContext('server', exportedNextConfigServerless);

      const finalWebpackConfig = await materializeFinalWebpackConfig({
        exportedNextConfig: exportedNextConfigServerless,
        incomingWebpackConfig: serverWebpackConfig,
        incomingWebpackBuildContext: buildContext,
      });

      const sentryWebpackPluginInstance = findWebpackPlugin(
        finalWebpackConfig,
        'SentryCliPlugin',
      ) as SentryWebpackPlugin;

      expect(sentryWebpackPluginInstance.options.include).toEqual([
        { paths: [`${buildContext.dir}/.next/serverless/`], urlPrefix: '~/_next/serverless' },
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
        { paths: [`${serverBuildContextWebpack4.dir}/.next/server/pages/`], urlPrefix: '~/_next/server/pages' },
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
        { paths: [`${serverBuildContext.dir}/.next/server/pages/`], urlPrefix: '~/_next/server/pages' },
        { paths: [`${serverBuildContext.dir}/.next/server/chunks/`], urlPrefix: '~/_next/server/chunks' },
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

  describe('SentryWebpackPlugin enablement', () => {
    let processEnvBackup: typeof process.env;

    beforeEach(() => {
      processEnvBackup = { ...process.env };
    });

    afterEach(() => {
      process.env = processEnvBackup;
    });

    it.each([
      // [testName, exportedNextConfig, extraEnvValues, shouldFindServerPlugin, shouldFindClientPlugin]
      [
        'obeys `disableClientWebpackPlugin = true`',
        {
          ...exportedNextConfig,
          sentry: { disableClientWebpackPlugin: true },
        },
        {},
        true,
        false,
      ],

      [
        'obeys `disableServerWebpackPlugin = true`',
        {
          ...exportedNextConfig,
          sentry: { disableServerWebpackPlugin: true },
        },
        {},
        false,
        true,
      ],
      [
        'disables the plugin in Vercel `preview` environment',
        exportedNextConfig,
        { VERCEL_ENV: 'preview' },
        false,
        false,
      ],
      [
        'disables the plugin in Vercel `development` environment',
        exportedNextConfig,
        { VERCEL_ENV: 'development' },
        false,
        false,
      ],
      [
        'allows `disableClientWebpackPlugin = false` to override env vars`',
        {
          ...exportedNextConfig,
          sentry: { disableClientWebpackPlugin: false },
        },
        { VERCEL_ENV: 'preview' },
        false,
        true,
      ],
      [
        'allows `disableServerWebpackPlugin = false` to override env vars`',
        {
          ...exportedNextConfig,
          sentry: { disableServerWebpackPlugin: false },
        },
        { VERCEL_ENV: 'preview' },
        true,
        false,
      ],
    ])(
      '%s',
      async (
        _testName: string,
        exportedNextConfig: ExportedNextConfig,
        extraEnvValues: Record<string, string>,
        shouldFindServerPlugin: boolean,
        shouldFindClientPlugin: boolean,
      ) => {
        process.env = { ...process.env, ...extraEnvValues };

        // We create a copy of the next config for each `materializeFinalWebpackConfig` call because the `sentry`
        // property gets deleted along the way, and its value matters for some of our test cases
        const serverFinalWebpackConfig = await materializeFinalWebpackConfig({
          exportedNextConfig: { ...exportedNextConfig },
          userSentryWebpackPluginConfig,
          incomingWebpackConfig: serverWebpackConfig,
          incomingWebpackBuildContext: serverBuildContext,
        });

        const clientFinalWebpackConfig = await materializeFinalWebpackConfig({
          exportedNextConfig: { ...exportedNextConfig },
          userSentryWebpackPluginConfig,
          incomingWebpackConfig: clientWebpackConfig,
          incomingWebpackBuildContext: clientBuildContext,
        });

        const genericSentryWebpackPluginInstance = expect.any(SentryWebpackPlugin);

        expect(findWebpackPlugin(serverFinalWebpackConfig, 'SentryCliPlugin')).toEqual(
          shouldFindServerPlugin ? genericSentryWebpackPluginInstance : undefined,
        );
        expect(findWebpackPlugin(clientFinalWebpackConfig, 'SentryCliPlugin')).toEqual(
          shouldFindClientPlugin ? genericSentryWebpackPluginInstance : undefined,
        );
      },
    );
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
          expect(path).toMatch(new RegExp(`${buildContext.dir}/${expectedDistDir}.*`));
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
          expect(path).toMatch(new RegExp(`${buildContext.dir}/${expectedDistDir}.*`));
        }
      }
    });
  });
});
