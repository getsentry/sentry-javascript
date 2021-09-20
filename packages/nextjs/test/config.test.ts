import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as rimraf from 'rimraf';

import { withSentryConfig } from '../src/config';
import {
  BuildContext,
  EntryPropertyFunction,
  ExportedNextConfig,
  NextConfigObject,
  SentryWebpackPlugin as SentryWebpackPluginType,
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
const defaultsObject = { defaultConfig: {} };

/** mocks of the arguments passed to `nextConfig.webpack` */
const serverWebpackConfig = {
  entry: () =>
    Promise.resolve({
      'pages/api/dogs/[name]': 'private-next-pages/api/dogs/[name].js',
      'pages/_app': ['./node_modules/smellOVision/index.js', 'private-next-pages/_app.js'],
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
    config: { target: 'server', ...userNextConfig },
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

  describe('webpack `entry` property config', () => {
    const serverConfigFilePath = `./${SERVER_SDK_CONFIG_FILE}`;
    const clientConfigFilePath = `./${CLIENT_SDK_CONFIG_FILE}`;

    it('handles various entrypoint shapes', async () => {
      const finalWebpackConfig = await materializeFinalWebpackConfig({
        userNextConfig,
        incomingWebpackConfig: serverWebpackConfig,
        incomingWebpackBuildContext: serverBuildContext,
      });

      expect(finalWebpackConfig.entry).toEqual(
        expect.objectContaining({
          // original entry point value is a string
          // (was 'private-next-pages/api/dogs/[name].js')
          'pages/api/dogs/[name]': [serverConfigFilePath, 'private-next-pages/api/dogs/[name].js'],

          // original entry point value is a string array
          // (was ['./node_modules/smellOVision/index.js', 'private-next-pages/_app.js'])
          'pages/_app': [serverConfigFilePath, './node_modules/smellOVision/index.js', 'private-next-pages/_app.js'],

          // original entry point value is an object containing a string `import` value
          // (`import` was 'private-next-pages/api/simulator/dogStats/[name].js')
          'pages/api/simulator/dogStats/[name]': {
            import: [serverConfigFilePath, 'private-next-pages/api/simulator/dogStats/[name].js'],
          },

          // original entry point value is an object containing a string array `import` value
          // (`import` was ['./node_modules/dogPoints/converter.js', 'private-next-pages/api/simulator/leaderboard.js'])
          'pages/api/simulator/leaderboard': {
            import: [
              serverConfigFilePath,
              './node_modules/dogPoints/converter.js',
              'private-next-pages/api/simulator/leaderboard.js',
            ],
          },

          // original entry point value is an object containg properties besides `import`
          // (`dependOn` remains untouched)
          'pages/api/tricks/[trickName]': {
            import: [serverConfigFilePath, 'private-next-pages/api/tricks/[trickName].js'],
            dependOn: 'treats',
          },
        }),
      );
    });

    it('does not inject into non-_app, non-API routes', async () => {
      const finalWebpackConfig = await materializeFinalWebpackConfig({
        userNextConfig,
        incomingWebpackConfig: clientWebpackConfig,
        incomingWebpackBuildContext: clientBuildContext,
      });

      expect(finalWebpackConfig.entry).toEqual(
        expect.objectContaining({
          // no injected file
          main: './src/index.ts',
          // was 'next-client-pages-loader?page=%2F_app'
          'pages/_app': [clientConfigFilePath, 'next-client-pages-loader?page=%2F_app'],
        }),
      );
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

    expect(finalWebpackConfig.plugins?.[0].options).toEqual(
      expect.objectContaining({
        include: expect.any(Array), // default, tested separately elsewhere
        ignore: [], // default
        org: 'squirrelChasers', // from user webpack plugin config
        project: 'simulator', // from user webpack plugin config
        authToken: 'dogsarebadatkeepingsecrets', // picked up from env
        stripPrefix: ['webpack://_N_E/'], // default
        urlPrefix: `~/_next`, // default
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

    expect((finalWebpackConfig.plugins?.[0].options as SentryWebpackPluginOptions).debug).toEqual(true);
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

      const sentryWebpackPlugin = finalWebpackConfig.plugins?.[0] as SentryWebpackPluginType;

      expect(sentryWebpackPlugin.options?.include).toEqual([
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

      const sentryWebpackPlugin = finalWebpackConfig.plugins?.[0] as SentryWebpackPluginType;

      expect(sentryWebpackPlugin.options?.include).toEqual([
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

      const sentryWebpackPlugin = finalWebpackConfig.plugins?.[0] as SentryWebpackPluginType;

      expect(sentryWebpackPlugin.options?.include).toEqual([
        { paths: ['.next/server/pages/'], urlPrefix: '~/_next/server/pages' },
      ]);
    });

    it('has the correct value when building serverful server bundles using webpack 5', async () => {
      const finalWebpackConfig = await materializeFinalWebpackConfig({
        userNextConfig,
        incomingWebpackConfig: serverWebpackConfig,
        incomingWebpackBuildContext: serverBuildContext,
      });

      const sentryWebpackPlugin = finalWebpackConfig.plugins?.[0] as SentryWebpackPluginType;

      expect(sentryWebpackPlugin.options?.include).toEqual([
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

      const sentryWebpackPlugin = finalWebpackConfig.plugins?.[0] as SentryWebpackPluginType;

      expect(sentryWebpackPlugin.options?.include).toEqual([
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

      const sentryWebpackPlugin = finalWebpackConfig.plugins?.[0] as SentryWebpackPluginType;

      expect(sentryWebpackPlugin.options?.include).toEqual([
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

      const sentryWebpackPlugin = finalWebpackConfig.plugins?.[0] as SentryWebpackPluginType;

      expect(sentryWebpackPlugin.options?.include).toEqual([
        { paths: ['.next/server/pages/'], urlPrefix: '~/city-park/_next/server/pages' },
      ]);
    });

    it('has the correct value when building serverful server bundles using webpack 5', async () => {
      const finalWebpackConfig = await materializeFinalWebpackConfig({
        userNextConfig: userNextConfigWithBasePath,
        incomingWebpackConfig: serverWebpackConfig,
        incomingWebpackBuildContext: getBuildContext('server', userNextConfigWithBasePath),
      });

      const sentryWebpackPlugin = finalWebpackConfig.plugins?.[0] as SentryWebpackPluginType;

      expect(sentryWebpackPlugin.options?.include).toEqual([
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
      const tempDirPathPrefix = path.join(os.tmpdir(), 'sentry-nextjs-test-');
      tempDir = fs.mkdtempSync(tempDirPathPrefix);
    });

    afterEach(() => {
      rimraf.sync(tempDir);
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

  it.each([
    /** `distDir` is not defined */
    [getBuildContext('client', {}), '.next'], // client
    [getBuildContext('server', { target: 'experimental-serverless-trace' }), '.next'], // serverless
    [getBuildContext('server', {}, '4'), '.next'], // server, webpack < 5
    [getBuildContext('server', {}, '5'), '.next'], // server, webpack == 5

    /** `distDir` is defined */
    [getBuildContext('client', { distDir: 'tmpDir' }), 'tmpDir'], // client
    [getBuildContext('server', { distDir: 'tmpDir', target: 'experimental-serverless-trace' }), 'tmpDir'], // serverless
    [getBuildContext('server', { distDir: 'tmpDir' }, '4'), 'tmpDir'], // server, webpack < 5
    [getBuildContext('server', { distDir: 'tmpDir' }, '5'), 'tmpDir'], // server, webpack == 5
  ])('correct paths from `distDir` in WebpackPluginOptions', (buildContext: BuildContext, expectedDistDir) => {
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
