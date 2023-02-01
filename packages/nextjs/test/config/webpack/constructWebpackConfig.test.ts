// mock helper functions not tested directly in this file
import '../mocks';

import { default as SentryWebpackPlugin } from '@sentry/webpack-plugin';

import {
  CLIENT_SDK_CONFIG_FILE,
  clientBuildContext,
  clientWebpackConfig,
  EDGE_SDK_CONFIG_FILE,
  edgeBuildContext,
  exportedNextConfig,
  SERVER_SDK_CONFIG_FILE,
  serverBuildContext,
  serverWebpackConfig,
  userNextConfig,
} from '../fixtures';
import { materializeFinalNextConfig, materializeFinalWebpackConfig } from '../testUtils';

describe('constructWebpackConfigFunction()', () => {
  it('includes expected properties', async () => {
    const finalWebpackConfig = await materializeFinalWebpackConfig({
      exportedNextConfig,
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
      exportedNextConfig,
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

  it("doesn't set devtool if webpack plugin is disabled", () => {
    const finalNextConfig = materializeFinalNextConfig({
      ...exportedNextConfig,
      webpack: () =>
        ({
          ...serverWebpackConfig,
          devtool: 'something-besides-source-map',
        } as any),
      sentry: { disableServerWebpackPlugin: true },
    });
    const finalWebpackConfig = finalNextConfig.webpack?.(serverWebpackConfig, serverBuildContext);

    expect(finalWebpackConfig?.devtool).not.toEqual('source-map');
  });

  it('allows for the use of `hidden-source-map` as `devtool` value for client-side builds', async () => {
    const exportedNextConfigHiddenSourceMaps = {
      ...exportedNextConfig,
      sentry: { ...exportedNextConfig.sentry, hideSourceMaps: true },
    };

    const finalClientWebpackConfig = await materializeFinalWebpackConfig({
      exportedNextConfig: exportedNextConfigHiddenSourceMaps,
      incomingWebpackConfig: clientWebpackConfig,
      incomingWebpackBuildContext: clientBuildContext,
    });

    const finalServerWebpackConfig = await materializeFinalWebpackConfig({
      exportedNextConfig: exportedNextConfigHiddenSourceMaps,
      incomingWebpackConfig: serverWebpackConfig,
      incomingWebpackBuildContext: serverBuildContext,
    });

    expect(finalClientWebpackConfig.devtool).toEqual('hidden-source-map');
    expect(finalServerWebpackConfig.devtool).toEqual('source-map');
  });

  describe('webpack `entry` property config', () => {
    const serverConfigFilePath = `./${SERVER_SDK_CONFIG_FILE}`;
    const clientConfigFilePath = `./${CLIENT_SDK_CONFIG_FILE}`;
    const edgeConfigFilePath = `./${EDGE_SDK_CONFIG_FILE}`;

    it('handles various entrypoint shapes', async () => {
      const finalWebpackConfig = await materializeFinalWebpackConfig({
        exportedNextConfig,
        incomingWebpackConfig: serverWebpackConfig,
        incomingWebpackBuildContext: serverBuildContext,
      });

      expect(finalWebpackConfig.entry).toEqual(
        expect.objectContaining({
          // original entrypoint value is a string
          // (was 'private-next-pages/_error.js')
          'pages/_error': [serverConfigFilePath, 'private-next-pages/_error.js'],

          // original entrypoint value is a string array
          // (was ['./node_modules/smellOVision/index.js', 'private-next-pages/sniffTour.js'])
          'pages/sniffTour': [
            serverConfigFilePath,
            './node_modules/smellOVision/index.js',
            'private-next-pages/sniffTour.js',
          ],

          // original entrypoint value is an object containing a string `import` value
          // (was { import: 'private-next-pages/api/simulator/dogStats/[name].js' })
          'pages/api/simulator/dogStats/[name]': {
            import: [serverConfigFilePath, 'private-next-pages/api/simulator/dogStats/[name].js'],
          },

          // original entrypoint value is an object containing a string array `import` value
          // (was { import: ['./node_modules/dogPoints/converter.js', 'private-next-pages/simulator/leaderboard.js'] })
          'pages/simulator/leaderboard': {
            import: [
              serverConfigFilePath,
              './node_modules/dogPoints/converter.js',
              'private-next-pages/simulator/leaderboard.js',
            ],
          },

          // original entrypoint value is an object containg properties besides `import`
          // (was { import: 'private-next-pages/api/tricks/[trickName].js', dependOn: 'treats', })
          'pages/api/tricks/[trickName]': {
            import: [serverConfigFilePath, 'private-next-pages/api/tricks/[trickName].js'],
            dependOn: 'treats', // untouched
          },
        }),
      );
    });

    it('injects user config file into `_app` in server bundle and in the client bundle', async () => {
      const finalServerWebpackConfig = await materializeFinalWebpackConfig({
        exportedNextConfig,
        incomingWebpackConfig: serverWebpackConfig,
        incomingWebpackBuildContext: serverBuildContext,
      });
      const finalClientWebpackConfig = await materializeFinalWebpackConfig({
        exportedNextConfig,
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
        exportedNextConfig,
        incomingWebpackConfig: serverWebpackConfig,
        incomingWebpackBuildContext: serverBuildContext,
      });
      const finalClientWebpackConfig = await materializeFinalWebpackConfig({
        exportedNextConfig,
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

    it('injects user config file into both API routes and non-API routes', async () => {
      const finalWebpackConfig = await materializeFinalWebpackConfig({
        exportedNextConfig,
        incomingWebpackConfig: serverWebpackConfig,
        incomingWebpackBuildContext: serverBuildContext,
      });

      expect(finalWebpackConfig.entry).toEqual(
        expect.objectContaining({
          'pages/api/simulator/dogStats/[name]': {
            import: expect.arrayContaining([serverConfigFilePath]),
          },

          'pages/api/tricks/[trickName]': expect.objectContaining({
            import: expect.arrayContaining([serverConfigFilePath]),
          }),

          'pages/simulator/leaderboard': {
            import: expect.arrayContaining([serverConfigFilePath]),
          },
        }),
      );
    });

    it('injects user config file into API middleware', async () => {
      const finalWebpackConfig = await materializeFinalWebpackConfig({
        exportedNextConfig,
        incomingWebpackConfig: serverWebpackConfig,
        incomingWebpackBuildContext: edgeBuildContext,
      });

      expect(finalWebpackConfig.entry).toEqual(
        expect.objectContaining({
          middleware: [edgeConfigFilePath, 'private-next-pages/middleware.js'],
        }),
      );
    });

    it('does not inject anything into non-_app pages during client build', async () => {
      const finalWebpackConfig = await materializeFinalWebpackConfig({
        exportedNextConfig,
        incomingWebpackConfig: clientWebpackConfig,
        incomingWebpackBuildContext: clientBuildContext,
      });

      expect(finalWebpackConfig.entry).toEqual({
        main: './src/index.ts',
        // only _app has config file injected
        'pages/_app': ['./sentry.client.config.js', 'next-client-pages-loader?page=%2F_app'],
        'pages/_error': 'next-client-pages-loader?page=%2F_error',
        'pages/sniffTour': ['./node_modules/smellOVision/index.js', 'private-next-pages/sniffTour.js'],
        'pages/simulator/leaderboard': {
          import: ['./node_modules/dogPoints/converter.js', 'private-next-pages/simulator/leaderboard.js'],
        },
        simulatorBundle: './src/simulator/index.ts',
      });
    });

    it('does not inject into routes included in `excludeServerRoutes`', async () => {
      const nextConfigWithExcludedRoutes = {
        ...exportedNextConfig,
        sentry: {
          excludeServerRoutes: [/simulator/],
        },
      };
      const finalWebpackConfig = await materializeFinalWebpackConfig({
        exportedNextConfig: nextConfigWithExcludedRoutes,
        incomingWebpackConfig: serverWebpackConfig,
        incomingWebpackBuildContext: serverBuildContext,
      });

      expect(finalWebpackConfig.entry).toEqual(
        expect.objectContaining({
          'pages/simulator/leaderboard': {
            import: expect.not.arrayContaining([serverConfigFilePath]),
          },
          'pages/api/simulator/dogStats/[name]': {
            import: expect.not.arrayContaining([serverConfigFilePath]),
          },
        }),
      );
    });
  });
});
