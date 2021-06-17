import { withSentryConfig } from '../src/config';
import {
  BuildContext,
  EntryPropertyFunction,
  ExportedNextConfig,
  NextConfigObject,
  SentryWebpackPluginOptions,
  WebpackConfigObject,
} from '../src/config/types';
import { SENTRY_SERVER_CONFIG_FILE, SERVER_SDK_INIT_PATH, storeServerConfigFileLocation } from '../src/config/utils';
import { constructWebpackConfigFunction, SentryWebpackPlugin } from '../src/config/webpack';

// mock `storeServerConfigFileLocation` in order to make it a no-op when necessary
jest.mock('../src/config/utils', () => {
  const original = jest.requireActual('../src/config/utils');
  return {
    ...original,
    storeServerConfigFileLocation: jest.fn().mockImplementation(original.setRuntimeEnvVars),
  };
});

/** mocks of the arguments passed to `withSentryConfig` */
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

/** mocks of the arguments passed to `nextConfig.webpack` */
const serverWebpackConfig = {
  entry: () => Promise.resolve({ 'pages/api/dogs/[name]': 'private-next-pages/api/dogs/[name].js' }),
  output: { filename: '[name].js', path: '/Users/Maisey/projects/squirrelChasingSimulator/.next' },
  target: 'node',
  context: '/Users/Maisey/projects/squirrelChasingSimulator',
};
const clientWebpackConfig = {
  entry: () => Promise.resolve({ main: './src/index.ts' }),
  output: { filename: 'static/chunks/[name].js', path: '/Users/Maisey/projects/squirrelChasingSimulator/.next' },
  target: 'web',
  context: '/Users/Maisey/projects/squirrelChasingSimulator',
};
const buildContext = { isServer: true, dev: false, buildId: 'doGsaREgReaT' };

/**
 * Derive the final values of all next config options, by first applying `withSentryConfig` and then running the
 * resulting function.
 *
 * @param userNextConfig Next config options provided by the user
 * @param userSentryWebpackPluginConfig SentryWebpackPlugin options provided by the user
 *
 * @returns The config values next will receive when it calls the function returned by `withSentryConfig`
 */
function materializeFinalNextConfig(
  userNextConfig: ExportedNextConfig,
  userSentryWebpackPluginConfig: SentryWebpackPluginOptions,
): NextConfigObject {
  const configFunction = withSentryConfig(userNextConfig, userSentryWebpackPluginConfig);
  const finalConfigValues = configFunction('phase-production-build', {
    defaultConfig: {},
  });

  return finalConfigValues;
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
  userSentryWebpackPluginConfig: SentryWebpackPluginOptions;
  incomingWebpackConfig: WebpackConfigObject;
  incomingWebpackBuildContext: BuildContext;
}): Promise<WebpackConfigObject> {
  const { userNextConfig, userSentryWebpackPluginConfig, incomingWebpackConfig, incomingWebpackBuildContext } = options;

  // get the webpack config function we'd normally pass back to next
  const webpackConfigFunction = constructWebpackConfigFunction(userNextConfig, userSentryWebpackPluginConfig);

  // call it to get concrete values for comparison
  const finalWebpackConfigValue = webpackConfigFunction(incomingWebpackConfig, incomingWebpackBuildContext);
  const webpackEntryProperty = finalWebpackConfigValue.entry as EntryPropertyFunction;
  finalWebpackConfigValue.entry = await webpackEntryProperty();

  return finalWebpackConfigValue;
}

describe('withSentryConfig', () => {
  it('includes expected properties', () => {
    const finalConfig = materializeFinalNextConfig(userNextConfig, userSentryWebpackPluginConfig);

    expect(finalConfig).toEqual(
      expect.objectContaining({
        productionBrowserSourceMaps: true,
        webpack: expect.any(Function), // `webpack` is tested specifically elsewhere
      }),
    );
  });

  it('preserves unrelated next config options', () => {
    const finalConfig = materializeFinalNextConfig(userNextConfig, userSentryWebpackPluginConfig);

    expect(finalConfig.publicRuntimeConfig).toEqual(userNextConfig.publicRuntimeConfig);
  });

  it("works when user's overall config is an object", () => {
    const finalConfig = materializeFinalNextConfig(userNextConfig, userSentryWebpackPluginConfig);

    expect(finalConfig).toEqual(
      expect.objectContaining({
        ...userNextConfig,
        productionBrowserSourceMaps: true,
        webpack: expect.any(Function), // `webpack` is tested specifically elsewhere
      }),
    );
  });

  it("works when user's overall config is a function", () => {
    const userNextConfigFunction = () => userNextConfig;

    const finalConfig = materializeFinalNextConfig(userNextConfigFunction, userSentryWebpackPluginConfig);

    expect(finalConfig).toEqual(
      expect.objectContaining({
        ...userNextConfigFunction(),
        productionBrowserSourceMaps: true,
        webpack: expect.any(Function), // `webpack` is tested specifically elsewhere
      }),
    );
  });
});

describe('webpack config', () => {
  beforeEach(() => {
    // nuke this so it won't try to look for our dummy paths
    (storeServerConfigFileLocation as jest.Mock).mockImplementationOnce(() => undefined);
  });

  it('includes expected properties', async () => {
    const finalWebpackConfig = await materializeFinalWebpackConfig({
      userNextConfig,
      userSentryWebpackPluginConfig,
      incomingWebpackConfig: serverWebpackConfig,
      incomingWebpackBuildContext: buildContext,
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
      userSentryWebpackPluginConfig,
      incomingWebpackConfig: serverWebpackConfig,
      incomingWebpackBuildContext: buildContext,
    });

    // Run the user's webpack config function, so we can check the results against ours. Delete `entry` because we'll
    // test it separately, and besides, it's one that we *should* be overwriting.
    const materializedUserWebpackConfig = userNextConfig.webpack(serverWebpackConfig, buildContext);
    // @ts-ignore `entry` may be required in real life, but we don't need it for our tests
    delete materializedUserWebpackConfig.entry;

    expect(finalWebpackConfig).toEqual(expect.objectContaining(materializedUserWebpackConfig));
  });

  describe('webpack `entry` property config', () => {
    it('injects correct code when building server bundle', async () => {
      const finalWebpackConfig = await materializeFinalWebpackConfig({
        userNextConfig,
        userSentryWebpackPluginConfig,
        incomingWebpackConfig: serverWebpackConfig,
        incomingWebpackBuildContext: buildContext,
      });

      expect(finalWebpackConfig.entry).toEqual(
        expect.objectContaining({
          [SERVER_SDK_INIT_PATH.slice(0, -3)]: SENTRY_SERVER_CONFIG_FILE,
        }),
      );
    });

    it('injects correct code when building client bundle', async () => {
      const finalWebpackConfig = await materializeFinalWebpackConfig({
        userNextConfig,
        userSentryWebpackPluginConfig,
        incomingWebpackConfig: clientWebpackConfig,
        incomingWebpackBuildContext: { ...buildContext, isServer: false },
      });

      expect(finalWebpackConfig.entry).toEqual(
        expect.objectContaining({ main: ['./src/index.ts', './sentry.client.config.js'] }),
      );
    });

    // see https://github.com/getsentry/sentry-javascript/pull/3696#issuecomment-863363803
    it('handles non-empty `main.js` entry point', async () => {
      const finalWebpackConfig = await materializeFinalWebpackConfig({
        userNextConfig,
        userSentryWebpackPluginConfig,
        incomingWebpackConfig: {
          ...clientWebpackConfig,
          entry: () => Promise.resolve({ main: './src/index.ts', 'main.js': ['sitLieDownRollOver.config.js'] }),
        },
        incomingWebpackBuildContext: { ...buildContext, isServer: false },
      });

      expect(finalWebpackConfig.entry).toEqual(
        expect.objectContaining({
          main: ['sitLieDownRollOver.config.js', './src/index.ts', './sentry.client.config.js'],
          'main.js': [],
        }),
      );
    });
  });
});

describe('Sentry webpack plugin config', () => {
  it('includes expected properties', () => {
    // pass
  });

  it('preserves unrelated plugin config options', () => {
    // pass
  });

  it('warns when overriding certain default values', () => {
    // pass
  });

  it("merges default include and ignore/ignoreFile options with user's values", () => {
    // do we even want to do this?
  });
});
