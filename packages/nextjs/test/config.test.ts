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
  CLIENT_SDK_CONFIG_FILE,
  constructWebpackConfigFunction,
  SentryWebpackPlugin,
  SERVER_SDK_CONFIG_FILE,
} from '../src/config/webpack';

/** Mocks of the arguments passed to `withSentryConfig` */
const userNextConfig = {
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
const userSentryWebpackPluginConfig = { org: 'squirrelChasers', project: 'simulator', include: './thirdPartyMaps' };

/** Mocks of the arguments passed to the result of `withSentryConfig` (when it's a function). */
const runtimePhase = 'ball-fetching';
const defaultNextConfig = { nappingHoursPerDay: 20, oversizeFeet: true, shouldChaseTail: true };

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
const serverBuildContext = { isServer: true, dev: false, buildId: 'doGsaREgReaT' };
const clientBuildContext = { isServer: false, dev: false, buildId: 'doGsaREgReaT' };

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
  userSentryWebpackPluginConfig?: SentryWebpackPluginOptions,
): NextConfigObject {
  const sentrifiedConfig = withSentryConfig(userNextConfig, userSentryWebpackPluginConfig);
  let finalConfigValues = sentrifiedConfig;

  if (typeof sentrifiedConfig === 'function') {
    // for some reason TS won't recognize that `finalConfigValues` is now a NextConfigObject, which is why the cast
    // below is necessary
    finalConfigValues = sentrifiedConfig(runtimePhase, {
      defaultConfig: defaultNextConfig,
    });
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
  userSentryWebpackPluginConfig?: SentryWebpackPluginOptions;
  incomingWebpackConfig: WebpackConfigObject;
  incomingWebpackBuildContext: BuildContext;
}): Promise<WebpackConfigObject> {
  const { userNextConfig, userSentryWebpackPluginConfig, incomingWebpackConfig, incomingWebpackBuildContext } = options;

  // if the user's next config is a function, run it so we have access to the values
  const materializedUserNextConfig =
    typeof userNextConfig === 'function'
      ? userNextConfig('phase-production-build', {
          defaultConfig: {},
        })
      : userNextConfig;

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

    expect(userNextConfigFunction).toHaveBeenCalledWith(runtimePhase, {
      defaultConfig: defaultNextConfig,
    });
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
    const materializedUserWebpackConfig = userNextConfig.webpack(serverWebpackConfig, serverBuildContext);
    // @ts-ignore `entry` may be required in real life, but we don't need it for our tests
    delete materializedUserWebpackConfig.entry;

    expect(finalWebpackConfig).toEqual(expect.objectContaining(materializedUserWebpackConfig));
  });

  describe('webpack `entry` property config', () => {
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
          'pages/api/dogs/[name]': [SERVER_SDK_CONFIG_FILE, 'private-next-pages/api/dogs/[name].js'],

          // original entry point value is a string array
          // (was ['./node_modules/smellOVision/index.js', 'private-next-pages/_app.js'])
          'pages/_app': [SERVER_SDK_CONFIG_FILE, './node_modules/smellOVision/index.js', 'private-next-pages/_app.js'],

          // original entry point value is an object containing a string `import` value
          // (`import` was 'private-next-pages/api/simulator/dogStats/[name].js')
          'pages/api/simulator/dogStats/[name]': {
            import: [SERVER_SDK_CONFIG_FILE, 'private-next-pages/api/simulator/dogStats/[name].js'],
          },

          // original entry point value is an object containing a string array `import` value
          // (`import` was ['./node_modules/dogPoints/converter.js', 'private-next-pages/api/simulator/leaderboard.js'])
          'pages/api/simulator/leaderboard': {
            import: [
              SERVER_SDK_CONFIG_FILE,
              './node_modules/dogPoints/converter.js',
              'private-next-pages/api/simulator/leaderboard.js',
            ],
          },

          // original entry point value is an object containg properties besides `import`
          // (`dependOn` remains untouched)
          'pages/api/tricks/[trickName]': {
            import: [SERVER_SDK_CONFIG_FILE, 'private-next-pages/api/tricks/[trickName].js'],
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
          'pages/_app': [CLIENT_SDK_CONFIG_FILE, 'next-client-pages-loader?page=%2F_app'],
        }),
      );
    });
  });
});

describe('Sentry webpack plugin config', () => {
  it('includes expected properties', () => {
    // TODO
  });

  it('preserves unrelated plugin config options', () => {
    // TODO
  });

  it('warns when overriding certain default values', () => {
    // TODO
  });

  it("merges default include and ignore/ignoreFile options with user's values", () => {
    // do we even want to do this?
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
});
