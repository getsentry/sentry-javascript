// mock helper functions not tested directly in this file
import '../mocks';
import * as core from '@sentry/core';
import { describe, expect, it, vi } from 'vitest';
import * as getWebpackPluginOptionsModule from '../../../src/config/webpackPluginOptions';
import {
  CLIENT_SDK_CONFIG_FILE,
  clientBuildContext,
  clientWebpackConfig,
  exportedNextConfig,
  serverBuildContext,
  serverWebpackConfig,
  userNextConfig,
} from '../fixtures';
import { materializeFinalNextConfig, materializeFinalWebpackConfig } from '../testUtils';

describe('constructWebpackConfigFunction()', () => {
  it('includes expected properties', async () => {
    vi.spyOn(core, 'loadModule').mockImplementation(() => ({
      sentryWebpackPlugin: () => ({
        _name: 'sentry-webpack-plugin',
      }),
    }));

    const finalWebpackConfig = await materializeFinalWebpackConfig({
      exportedNextConfig,
      incomingWebpackConfig: serverWebpackConfig,
      incomingWebpackBuildContext: serverBuildContext,
    });

    expect(finalWebpackConfig).toEqual(
      expect.objectContaining({
        devtool: 'source-map',
        entry: expect.any(Object), // `entry` is tested specifically elsewhere
        plugins: expect.arrayContaining([expect.objectContaining({ _name: 'sentry-webpack-plugin' })]),
      }),
    );
  });

  it('preserves existing devtool setting', async () => {
    const customDevtool = 'eval-source-map';
    const finalWebpackConfig = await materializeFinalWebpackConfig({
      exportedNextConfig,
      incomingWebpackConfig: {
        ...serverWebpackConfig,
        devtool: customDevtool,
      },
      incomingWebpackBuildContext: serverBuildContext,
      sentryBuildTimeOptions: {},
    });

    expect(finalWebpackConfig.devtool).toEqual(customDevtool);
  });

  it('automatically enables deleteSourcemapsAfterUpload for client builds when not explicitly set', async () => {
    const getWebpackPluginOptionsSpy = vi.spyOn(getWebpackPluginOptionsModule, 'getWebpackPluginOptions');
    vi.spyOn(core, 'loadModule').mockImplementation(() => ({
      sentryWebpackPlugin: () => ({
        _name: 'sentry-webpack-plugin',
      }),
    }));

    await materializeFinalWebpackConfig({
      exportedNextConfig,
      incomingWebpackConfig: clientWebpackConfig,
      incomingWebpackBuildContext: clientBuildContext,
      sentryBuildTimeOptions: {
        sourcemaps: {},
      },
    });

    expect(getWebpackPluginOptionsSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        isServer: false,
      }),
      expect.objectContaining({
        sourcemaps: {
          deleteSourcemapsAfterUpload: true,
        },
      }),
      undefined,
    );

    getWebpackPluginOptionsSpy.mockRestore();
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
    // @ts-expect-error `entry` may be required in real life, but we don't need it for our tests
    delete materializedUserWebpackConfig.entry;

    expect(finalWebpackConfig).toEqual(expect.objectContaining(materializedUserWebpackConfig));
  });

  it("doesn't set devtool if webpack plugin is disabled", () => {
    const finalNextConfig = materializeFinalNextConfig(
      {
        ...exportedNextConfig,
        webpack: () =>
          ({
            ...serverWebpackConfig,
            devtool: 'something-besides-source-map',
          }) as any,
      },
      undefined,
      {
        sourcemaps: {
          disable: true,
        },
      },
    );

    const finalWebpackConfig = finalNextConfig.webpack?.(serverWebpackConfig, serverBuildContext);

    expect(finalWebpackConfig?.devtool).not.toEqual('source-map');
  });

  it('uses `hidden-source-map` as `devtool` value for client-side builds', async () => {
    vi.spyOn(core, 'loadModule').mockImplementation(() => ({
      sentryWebpackPlugin: () => ({
        _name: 'sentry-webpack-plugin',
      }),
    }));

    const finalClientWebpackConfig = await materializeFinalWebpackConfig({
      exportedNextConfig: exportedNextConfig,
      incomingWebpackConfig: clientWebpackConfig,
      incomingWebpackBuildContext: clientBuildContext,
      sentryBuildTimeOptions: {},
    });

    const finalServerWebpackConfig = await materializeFinalWebpackConfig({
      exportedNextConfig: exportedNextConfig,
      incomingWebpackConfig: serverWebpackConfig,
      incomingWebpackBuildContext: serverBuildContext,
      sentryBuildTimeOptions: {},
    });

    expect(finalClientWebpackConfig.devtool).toEqual('hidden-source-map');
    expect(finalServerWebpackConfig.devtool).toEqual('source-map');
  });

  describe('webpack `entry` property config', () => {
    const clientConfigFilePath = `./${CLIENT_SDK_CONFIG_FILE}`;

    it('injects user config file into `_app` in server bundle and in the client bundle', async () => {
      const finalClientWebpackConfig = await materializeFinalWebpackConfig({
        exportedNextConfig,
        incomingWebpackConfig: clientWebpackConfig,
        incomingWebpackBuildContext: clientBuildContext,
      });

      expect(finalClientWebpackConfig.entry).toEqual(
        expect.objectContaining({
          'pages/_app': expect.arrayContaining([clientConfigFilePath]),
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
  });
});
