import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as rimraf from 'rimraf';
import { WebpackPluginInstance } from 'webpack';

import { withSentryConfig } from '../src/config';
import {
  BuildContext,
  EntryPropertyFunction,
  ExportedNextConfig,
  NextConfigObject,
  SentryWebpackPluginOptions,
  WebpackConfigObject,
} from '../src/config/types';
import {
  constructWebpackConfigFunction,
  getUserConfigFile,
  getWebpackPluginOptions,
  SentryWebpackPlugin,
} from '../src/config/webpack';

const SERVER_SDK_CONFIG_FILE = 'sentry.server.config.js';
const CLIENT_SDK_CONFIG_FILE = 'sentry.client.config.js';

// We use `fs.existsSync()` in `getUserConfigFile()`. When we're not testing `getUserConfigFile()` specifically, all we
// need is for it to give us any valid answer, so make it always find what it's looking for. Since this is a core node
// built-in, though, which jest itself uses, otherwise let it do the normal thing. Storing the real version of the
// function also lets us restore the original when we do want to test `getUserConfigFile()`.
const realExistsSync = jest.requireActual('fs').existsSync;
const mockExistsSync = (path: fs.PathLike) => {
  if ((path as string).endsWith(SERVER_SDK_CONFIG_FILE) || (path as string).endsWith(CLIENT_SDK_CONFIG_FILE)) {
    return true;
  }

  return realExistsSync(path);
};
const exitsSync = jest.spyOn(fs, 'existsSync').mockImplementation(mockExistsSync);

// Make it so that all temporary folders, either created directly by tests or by the code they're testing, will go into
// one spot that we know about, which we can then clean up when we're done
const realTmpdir = jest.requireActual('os').tmpdir;
const TEMP_DIR_PATH = path.join(realTmpdir(), 'sentry-nextjs-test');
jest.spyOn(os, 'tmpdir').mockReturnValue(TEMP_DIR_PATH);
// In theory, we should always land in the `else` here, but this saves the cases where the prior run got interrupted and
// the `afterAll` below didn't happen.
if (fs.existsSync(TEMP_DIR_PATH)) {
  rimraf.sync(path.join(TEMP_DIR_PATH, '*'));
} else {
  fs.mkdirSync(TEMP_DIR_PATH);
}

afterAll(() => {
  rimraf.sync(TEMP_DIR_PATH);
});

// In order to know what to expect in the webpack config `entry` property, we need to know the path of the temporary
// directory created when doing the file injection, so wrap the real `mkdtempSync` and store the resulting path where we
// can access it
const mkdtempSyncSpy = jest.spyOn(fs, 'mkdtempSync');

afterEach(() => {
  mkdtempSyncSpy.mockClear();
});

/** Mocks of the arguments passed to `withSentryConfig` */
const userNextConfig: Partial<NextConfigObject> = {
  publicRuntimeConfig: { location: 'dogpark', activities: ['fetch', 'chasing', 'digging'] },
  webpack: (config: WebpackConfigObject, _options: BuildContext) => ({
    ...config,
    mode: 'universal-sniffing',
    entry: async () =>
      Promise.resolve({
        ...(await (config.entry as EntryPropertyFunction)()),
        simulatorBundle: './src/simulator/index.ts',
      }),
  }),
};
const userSentryWebpackPluginConfig = { org: 'squirrelChasers', project: 'simulator' };
process.env.SENTRY_AUTH_TOKEN = 'dogsarebadatkeepingsecrets';
process.env.SENTRY_RELEASE = 'doGsaREgReaT';

/** Mocks of the arguments passed to the result of `withSentryConfig` (when it's a function). */
const runtimePhase = 'ball-fetching';
// `defaultConfig` is the defaults for all nextjs options (we don't use these at all in the tests, so for our purposes
// here the values don't matter)
const defaultsObject = { defaultConfig: {} as NextConfigObject };

/** mocks of the arguments passed to `nextConfig.webpack` */
const serverWebpackConfig = {
  entry: () =>
    Promise.resolve({
      'pages/_error': 'private-next-pages/_error.js',
      'pages/_app': ['./node_modules/smellOVision/index.js', 'private-next-pages/_app.js'],
      'pages/api/_middleware': 'private-next-pages/api/_middleware.js',
      'pages/api/simulator/dogStats/[name]': { import: 'private-next-pages/api/simulator/dogStats/[name].js' },
      'pages/api/simulator/leaderboard': {
        import: ['./node_modules/dogPoints/converter.js', 'private-next-pages/api/simulator/leaderboard.js'],
      },
      'pages/api/tricks/[trickName]': {
        import: 'private-next-pages/api/tricks/[trickName].js',
        dependOn: 'treats',
      },
      treats: './node_modules/dogTreats/treatProvider.js',
    }),
  output: { filename: '[name].js', path: '/Users/Maisey/projects/squirrelChasingSimulator/.next' },
  target: 'node',
  context: '/Users/Maisey/projects/squirrelChasingSimulator',
};
const clientWebpackConfig = {
  entry: () =>
    Promise.resolve({
      main: './src/index.ts',
      'pages/_app': 'next-client-pages-loader?page=%2F_app',
      'pages/_error': 'next-client-pages-loader?page=%2F_error',
    }),
  output: { filename: 'static/chunks/[name].js', path: '/Users/Maisey/projects/squirrelChasingSimulator/.next' },
  target: 'web',
  context: '/Users/Maisey/projects/squirrelChasingSimulator',
};

// In real life, next will copy the `userNextConfig` into the `buildContext`. Since we're providing mocks for both of
// those, we need to mimic that behavior, and since `userNextConfig` can vary per test, we need to have the option do it
// dynamically.
function getBuildContext(
  buildTarget: 'server' | 'client',
  userNextConfig: Partial<NextConfigObject>,
  webpackVersion: string = '5.4.15',
): BuildContext {
  return {
    dev: false,
    buildId: 'sItStAyLiEdOwN',
    dir: '/Users/Maisey/projects/squirrelChasingSimulator',
    config: {
      // nextjs's default values
      target: 'server',
      distDir: '.next',
      ...userNextConfig,
    } as NextConfigObject,
    webpack: { version: webpackVersion },
    isServer: buildTarget === 'server',
  };
}

const serverBuildContext = getBuildContext('server', userNextConfig);
const clientBuildContext = getBuildContext('client', userNextConfig);

/**
 * Derive the final values of all next config options, by first applying `withSentryConfig` and then, if it returns a
 *  function, running that function.
 *
 * @param userNextConfig Next config options provided by the user
 * @param userSentryWebpackPluginConfig SentryWebpackPlugin options provided by the user
 *
 * @returns The config values next will receive directly from `withSentryConfig` or when it calls the function returned
 * by `withSentryConfig`
 */
function materializeFinalNextConfig(
  userNextConfig: ExportedNextConfig,
  userSentryWebpackPluginConfig?: Partial<SentryWebpackPluginOptions>,
): NextConfigObject {
  const sentrifiedConfig = withSentryConfig(userNextConfig, userSentryWebpackPluginConfig);
  let finalConfigValues = sentrifiedConfig;

  if (typeof sentrifiedConfig === 'function') {
    // for some reason TS won't recognize that `finalConfigValues` is now a NextConfigObject, which is why the cast
    // below is necessary
    finalConfigValues = sentrifiedConfig(runtimePhase, defaultsObject);
  }

  return finalConfigValues as NextConfigObject;
}

/**
 * Derive the final values of all webpack config options, by first applying `constructWebpackConfigFunction` and then
 * running the resulting function. Since the `entry` property of the resulting object is itself a function, also call
 * that.
 *
 * @param options An object including the following:
 *   - `userNextConfig` Next config options provided by the user
 *   - `userSentryWebpackPluginConfig` SentryWebpackPlugin options provided by the user
 *   - `incomingWebpackConfig` The existing webpack config, passed to the function as `config`
 *   - `incomingWebpackBuildContext` The existing webpack build context, passed to the function as `options`
 *
 * @returns The webpack config values next will use when it calls the function that `createFinalWebpackConfig` returns
 */
async function materializeFinalWebpackConfig(options: {
  userNextConfig: ExportedNextConfig;
  userSentryWebpackPluginConfig?: Partial<SentryWebpackPluginOptions>;
  incomingWebpackConfig: WebpackConfigObject;
  incomingWebpackBuildContext: BuildContext;
}): Promise<WebpackConfigObject> {
  const { userNextConfig, userSentryWebpackPluginConfig, incomingWebpackConfig, incomingWebpackBuildContext } = options;

  // if the user's next config is a function, run it so we have access to the values
  const materializedUserNextConfig =
    typeof userNextConfig === 'function' ? userNextConfig('phase-production-build', defaultsObject) : userNextConfig;

  // get the webpack config function we'd normally pass back to next
  const webpackConfigFunction = constructWebpackConfigFunction(
    materializedUserNextConfig,
    userSentryWebpackPluginConfig,
  );

  // call it to get concrete values for comparison
  const finalWebpackConfigValue = webpackConfigFunction(incomingWebpackConfig, incomingWebpackBuildContext);
  const webpackEntryProperty = finalWebpackConfigValue.entry as EntryPropertyFunction;
  finalWebpackConfigValue.entry = await webpackEntryProperty();

  return finalWebpackConfigValue;
}

// helper function to make sure we're checking the correct plugin's data
export function findWebpackPlugin(
  webpackConfig: WebpackConfigObject,
  pluginName: string,
): WebpackPluginInstance | SentryWebpackPlugin | undefined {
  return webpackConfig.plugins?.find(plugin => plugin.constructor.name === pluginName);
}

describe('withSentryConfig', () => {
  it('includes expected properties', () => {
    const finalConfig = materializeFinalNextConfig(userNextConfig);

    expect(finalConfig).toEqual(
      expect.objectContaining({
        webpack: expect.any(Function), // `webpack` is tested specifically elsewhere
      }),
    );
  });

  it('preserves unrelated next config options', () => {
    const finalConfig = materializeFinalNextConfig(userNextConfig);

    expect(finalConfig.publicRuntimeConfig).toEqual(userNextConfig.publicRuntimeConfig);
  });

  it("works when user's overall config is an object", () => {
    const finalConfig = materializeFinalNextConfig(userNextConfig);

    expect(finalConfig).toEqual(
      expect.objectContaining({
        ...userNextConfig,
        webpack: expect.any(Function), // `webpack` is tested specifically elsewhere
      }),
    );
  });

  it("works when user's overall config is a function", () => {
    const userNextConfigFunction = () => userNextConfig;

    const finalConfig = materializeFinalNextConfig(userNextConfigFunction);

    expect(finalConfig).toEqual(
      expect.objectContaining({
        ...userNextConfigFunction(),
        webpack: expect.any(Function), // `webpack` is tested specifically elsewhere
      }),
    );
  });

  it('correctly passes `phase` and `defaultConfig` through to functional `userNextConfig`', () => {
    const userNextConfigFunction = jest.fn().mockReturnValue(userNextConfig);

    materializeFinalNextConfig(userNextConfigFunction);

    expect(userNextConfigFunction).toHaveBeenCalledWith(runtimePhase, defaultsObject);
  });
});

describe('webpack config', () => {
  it('includes expected properties', async () => {
    const finalWebpackConfig = await materializeFinalWebpackConfig({
      userNextConfig,
      incomingWebpackConfig: serverWebpackConfig,
      incomingWebpackBuildContext: serverBuildContext,
    });

    expect(finalWebpackConfig).toEqual(
      expect.objectContaining({
        devtool: 'source-map',
        entry: expect.any(Object), // `entry` is tested specifically elsewhere
        plugins: expect.arrayContaining([expect.any(SentryWebpackPlugin)]),
      }),
    );
  });

  it('preserves unrelated webpack config options', async () => {
    const finalWebpackConfig = await materializeFinalWebpackConfig({
      userNextConfig,
      incomingWebpackConfig: serverWebpackConfig,
      incomingWebpackBuildContext: serverBuildContext,
    });

    // Run the user's webpack config function, so we can check the results against ours. Delete `entry` because we'll
    // test it separately, and besides, it's one that we *should* be overwriting.
    const materializedUserWebpackConfig = userNextConfig.webpack!(serverWebpackConfig, serverBuildContext);
    // @ts-ignore `entry` may be required in real life, but we don't need it for our tests
    delete materializedUserWebpackConfig.entry;

    expect(finalWebpackConfig).toEqual(expect.objectContaining(materializedUserWebpackConfig));
  });

  it('allows for the use of `hidden-source-map` as `devtool` value for client-side builds', async () => {
    const userNextConfigHiddenSourceMaps = { ...userNextConfig, sentry: { ...userNextConfig.sentry } };
    userNextConfigHiddenSourceMaps.sentry.hideSourceMaps = true;

    const finalClientWebpackConfig = await materializeFinalWebpackConfig({
      userNextConfig: userNextConfigHiddenSourceMaps,
      incomingWebpackConfig: clientWebpackConfig,
      incomingWebpackBuildContext: clientBuildContext,
    });

    const finalServerWebpackConfig = await materializeFinalWebpackConfig({
      userNextConfig: userNextConfigHiddenSourceMaps,
      incomingWebpackConfig: serverWebpackConfig,
      incomingWebpackBuildContext: serverBuildContext,
    });

    expect(finalClientWebpackConfig.devtool).toEqual('hidden-source-map');
    expect(finalServerWebpackConfig.devtool).toEqual('source-map');
  });

  describe('webpack `entry` property config', () => {
    const serverConfigFilePath = `./${SERVER_SDK_CONFIG_FILE}`;
    const clientConfigFilePath = `./${CLIENT_SDK_CONFIG_FILE}`;

    it('handles various entrypoint shapes', async () => {
      const finalWebpackConfig = await materializeFinalWebpackConfig({
        userNextConfig,
        incomingWebpackConfig: serverWebpackConfig,
        incomingWebpackBuildContext: serverBuildContext,
      });

      const tempDir = mkdtempSyncSpy.mock.results[0].value;
      const rewriteFramesHelper = path.join(tempDir, 'rewriteFramesHelper.js');

      expect(finalWebpackConfig.entry).toEqual(
        expect.objectContaining({
          // original entrypoint value is a string
          // (was 'private-next-pages/_error.js')
          'pages/_error': [rewriteFramesHelper, serverConfigFilePath, 'private-next-pages/_error.js'],

          // original entrypoint value is a string array
          // (was ['./node_modules/smellOVision/index.js', 'private-next-pages/_app.js'])
          'pages/_app': [
            rewriteFramesHelper,
            serverConfigFilePath,
            './node_modules/smellOVision/index.js',
            'private-next-pages/_app.js',
          ],

          // original entrypoint value is an object containing a string `import` value
          // (was { import: 'private-next-pages/api/simulator/dogStats/[name].js' })
          'pages/api/simulator/dogStats/[name]': {
            import: [rewriteFramesHelper, serverConfigFilePath, 'private-next-pages/api/simulator/dogStats/[name].js'],
          },

          // original entrypoint value is an object containing a string array `import` value
          // (was { import: ['./node_modules/dogPoints/converter.js', 'private-next-pages/api/simulator/leaderboard.js'] })
          'pages/api/simulator/leaderboard': {
            import: [
              rewriteFramesHelper,
              serverConfigFilePath,
              './node_modules/dogPoints/converter.js',
              'private-next-pages/api/simulator/leaderboard.js',
            ],
          },

          // original entrypoint value is an object containg properties besides `import`
          // (was { import: 'private-next-pages/api/tricks/[trickName].js', dependOn: 'treats', })
          'pages/api/tricks/[trickName]': {
            import: [rewriteFramesHelper, serverConfigFilePath, 'private-next-pages/api/tricks/[trickName].js'],
            dependOn: 'treats', // untouched
          },
        }),
      );
    });

    it('injects user config file into `_app` in both server and client bundles', async () => {
      const finalServerWebpackConfig = await materializeFinalWebpackConfig({
        userNextConfig,
        incomingWebpackConfig: serverWebpackConfig,
        incomingWebpackBuildContext: serverBuildContext,
      });
      const finalClientWebpackConfig = await materializeFinalWebpackConfig({
        userNextConfig,
        incomingWebpackConfig: clientWebpackConfig,
        incomingWebpackBuildContext: clientBuildContext,
      });

      expect(finalServerWebpackConfig.entry).toEqual(
        expect.objectContaining({
          'pages/_app': expect.arrayContaining([serverConfigFilePath]),
        }),
      );
      expect(finalClientWebpackConfig.entry).toEqual(
        expect.objectContaining({
          'pages/_app': expect.arrayContaining([clientConfigFilePath]),
        }),
      );
    });

    it('injects user config file into `_error` in server bundle but not client bundle', async () => {
      const finalServerWebpackConfig = await materializeFinalWebpackConfig({
        userNextConfig,
        incomingWebpackConfig: serverWebpackConfig,
        incomingWebpackBuildContext: serverBuildContext,
      });
      const finalClientWebpackConfig = await materializeFinalWebpackConfig({
        userNextConfig,
        incomingWebpackConfig: clientWebpackConfig,
        incomingWebpackBuildContext: clientBuildContext,
      });

      expect(finalServerWebpackConfig.entry).toEqual(
        expect.objectContaining({
          'pages/_error': expect.arrayContaining([serverConfigFilePath]),
        }),
      );
      expect(finalClientWebpackConfig.entry).toEqual(
        expect.objectContaining({
          'pages/_error': expect.not.arrayContaining([clientConfigFilePath]),
        }),
      );
    });

    it('injects user config file into API routes', async () => {
      const finalWebpackConfig = await materializeFinalWebpackConfig({
        userNextConfig,
        incomingWebpackConfig: serverWebpackConfig,
        incomingWebpackBuildContext: serverBuildContext,
      });

      expect(finalWebpackConfig.entry).toEqual(
        expect.objectContaining({
          'pages/api/simulator/dogStats/[name]': {
            import: expect.arrayContaining([serverConfigFilePath]),
          },

          'pages/api/simulator/leaderboard': {
            import: expect.arrayContaining([serverConfigFilePath]),
          },

          'pages/api/tricks/[trickName]': expect.objectContaining({
            import: expect.arrayContaining([serverConfigFilePath]),
          }),
        }),
      );
    });

    it('does not inject user config file into API middleware', async () => {
      const finalWebpackConfig = await materializeFinalWebpackConfig({
        userNextConfig,
        incomingWebpackConfig: serverWebpackConfig,
        incomingWebpackBuildContext: serverBuildContext,
      });

      expect(finalWebpackConfig.entry).toEqual(
        expect.objectContaining({
          // no injected file
          'pages/api/_middleware': 'private-next-pages/api/_middleware.js',
        }),
      );
    });

    it('does not inject anything into non-_app, non-_error, non-API routes', async () => {
      const finalWebpackConfig = await materializeFinalWebpackConfig({
        userNextConfig,
        incomingWebpackConfig: clientWebpackConfig,
        incomingWebpackBuildContext: clientBuildContext,
      });

      expect(finalWebpackConfig.entry).toEqual(
        expect.objectContaining({
          // no injected file
          main: './src/index.ts',
        }),
      );
    });

    it('does not inject `RewriteFrames` helper into client routes', async () => {
      const finalWebpackConfig = await materializeFinalWebpackConfig({
        userNextConfig,
        incomingWebpackConfig: clientWebpackConfig,
        incomingWebpackBuildContext: clientBuildContext,
      });

      expect(finalWebpackConfig.entry).toEqual(
        expect.objectContaining({
          // was 'next-client-pages-loader?page=%2F_app', and now has client config but not`RewriteFrames` helper injected
          'pages/_app': [clientConfigFilePath, 'next-client-pages-loader?page=%2F_app'],
        }),
      );
    });
  });

  describe('`distDir` value in default server-side `RewriteFrames` integration', () => {
    it.each([
      ['no custom `distDir`', undefined, '.next'],
      ['custom `distDir`', 'dist', 'dist'],
    ])(
      'creates file injecting `distDir` value into `global` - %s',
      async (_name, customDistDir, expectedInjectedValue) => {
        // Note: the fact that the file tested here gets injected correctly is covered in the 'webpack `entry` property
        // config' tests above

        const userNextConfigDistDir = {
          ...userNextConfig,
          ...(customDistDir && { distDir: customDistDir }),
        };
        await materializeFinalWebpackConfig({
          userNextConfig: userNextConfigDistDir,
          incomingWebpackConfig: serverWebpackConfig,
          incomingWebpackBuildContext: getBuildContext('server', userNextConfigDistDir),
        });

        const tempDir = mkdtempSyncSpy.mock.results[0].value;
        const rewriteFramesHelper = path.join(tempDir, 'rewriteFramesHelper.js');

        expect(fs.existsSync(rewriteFramesHelper)).toBe(true);

        const injectedCode = fs.readFileSync(rewriteFramesHelper).toString();
        expect(injectedCode).toEqual(`global.__rewriteFramesDistDir__ = '${expectedInjectedValue}';\n`);
      },
    );

    describe('`RewriteFrames` ends up with correct `distDir` value', () => {
      // TODO: this, along with any number of other parts of the build process, should be tested with an integration
      // test which actually runs webpack and inspects the resulting bundles (and that integration test should test
      // custom `distDir` values with and without a `.`, to make sure the regex escaping is working)
    });
  });
});

describe('Sentry webpack plugin config', () => {
  it('includes expected properties', async () => {
    // also, can pull from either env or user config (see notes on specific properties below)
    const finalWebpackConfig = await materializeFinalWebpackConfig({
      userNextConfig,
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
      userNextConfig,
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
        userNextConfig,
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

    it('has the correct value when building serverless server bundles', async () => {
      const userNextConfigServerless = { ...userNextConfig };
      userNextConfigServerless.target = 'experimental-serverless-trace';

      const finalWebpackConfig = await materializeFinalWebpackConfig({
        userNextConfig: userNextConfigServerless,
        incomingWebpackConfig: serverWebpackConfig,
        incomingWebpackBuildContext: getBuildContext('server', userNextConfigServerless),
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
      const serverBuildContextWebpack4 = getBuildContext('server', userNextConfig);
      serverBuildContextWebpack4.webpack.version = '4.15.13';

      const finalWebpackConfig = await materializeFinalWebpackConfig({
        userNextConfig,
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
        userNextConfig,
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

  describe("Sentry webpack plugin `include` option with basePath filled on next's config", () => {
    const userNextConfigWithBasePath = {
      ...userNextConfig,
      basePath: '/city-park',
    };

    it('has the correct value when building client bundles', async () => {
      const finalWebpackConfig = await materializeFinalWebpackConfig({
        userNextConfig: userNextConfigWithBasePath,
        incomingWebpackConfig: clientWebpackConfig,
        incomingWebpackBuildContext: getBuildContext('client', userNextConfigWithBasePath),
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
      const userNextConfigServerless = { ...userNextConfigWithBasePath };
      userNextConfigServerless.target = 'experimental-serverless-trace';

      const finalWebpackConfig = await materializeFinalWebpackConfig({
        userNextConfig: userNextConfigServerless,
        incomingWebpackConfig: serverWebpackConfig,
        incomingWebpackBuildContext: getBuildContext('server', userNextConfigServerless),
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
      const serverBuildContextWebpack4 = getBuildContext('server', userNextConfigWithBasePath);
      serverBuildContextWebpack4.webpack.version = '4.15.13';

      const finalWebpackConfig = await materializeFinalWebpackConfig({
        userNextConfig: userNextConfigWithBasePath,
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
        userNextConfig: userNextConfigWithBasePath,
        incomingWebpackConfig: serverWebpackConfig,
        incomingWebpackBuildContext: getBuildContext('server', userNextConfigWithBasePath),
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

  it('allows SentryWebpackPlugin to be turned off for client code (independent of server code)', () => {
    const clientFinalNextConfig = materializeFinalNextConfig({
      ...userNextConfig,
      sentry: { disableClientWebpackPlugin: true },
    });
    const clientFinalWebpackConfig = clientFinalNextConfig.webpack?.(clientWebpackConfig, clientBuildContext);

    const serverFinalNextConfig = materializeFinalNextConfig(userNextConfig, userSentryWebpackPluginConfig);
    const serverFinalWebpackConfig = serverFinalNextConfig.webpack?.(serverWebpackConfig, serverBuildContext);

    expect(clientFinalWebpackConfig?.plugins).not.toEqual(expect.arrayContaining([expect.any(SentryWebpackPlugin)]));
    expect(serverFinalWebpackConfig?.plugins).toEqual(expect.arrayContaining([expect.any(SentryWebpackPlugin)]));
  });

  it('allows SentryWebpackPlugin to be turned off for server code (independent of client code)', () => {
    const serverFinalNextConfig = materializeFinalNextConfig({
      ...userNextConfig,
      sentry: { disableServerWebpackPlugin: true },
    });
    const serverFinalWebpackConfig = serverFinalNextConfig.webpack?.(serverWebpackConfig, serverBuildContext);

    const clientFinalNextConfig = materializeFinalNextConfig(userNextConfig, userSentryWebpackPluginConfig);
    const clientFinalWebpackConfig = clientFinalNextConfig.webpack?.(clientWebpackConfig, clientBuildContext);

    expect(serverFinalWebpackConfig?.plugins).not.toEqual(expect.arrayContaining([expect.any(SentryWebpackPlugin)]));
    expect(clientFinalWebpackConfig?.plugins).toEqual(expect.arrayContaining([expect.any(SentryWebpackPlugin)]));
  });

  it("doesn't set devtool if webpack plugin is disabled", () => {
    const finalNextConfig = materializeFinalNextConfig({
      ...userNextConfig,
      webpack: () => ({ devtool: 'something-besides-source-map' } as any),
      sentry: { disableServerWebpackPlugin: true },
    });
    const finalWebpackConfig = finalNextConfig.webpack?.(serverWebpackConfig, serverBuildContext);

    expect(finalWebpackConfig?.devtool).not.toEqual('source-map');
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
      const includePaths = getWebpackPluginOptions(buildContext, {
        /** userPluginOptions */
      }).include as { paths: [] }[];

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
      const includePaths = getWebpackPluginOptions(buildContext, {
        /** userPluginOptions */
      }).include as { paths: [] }[];

      for (const pathDescriptor of includePaths) {
        for (const path of pathDescriptor.paths) {
          expect(path).toMatch(new RegExp(`^${expectedDistDir}.*`));
        }
      }
    });
  });
});
