// mock helper functions not tested directly in this file
import '../mocks';
import * as core from '@sentry/core';
import { describe, expect, it, vi } from 'vitest';
import * as getBuildPluginOptionsModule from '../../../src/config/getBuildPluginOptions';
import * as util from '../../../src/config/util';
import {
  CLIENT_SDK_CONFIG_FILE,
  clientBuildContext,
  clientWebpackConfig,
  edgeBuildContext,
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
    const getBuildPluginOptionsSpy = vi.spyOn(getBuildPluginOptionsModule, 'getBuildPluginOptions');
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

    expect(getBuildPluginOptionsSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        sentryBuildOptions: expect.objectContaining({
          sourcemaps: {
            deleteSourcemapsAfterUpload: true,
          },
        }),
        buildTool: 'webpack-client',
        distDirAbsPath: expect.any(String),
        releaseName: undefined,
      }),
    );

    getBuildPluginOptionsSpy.mockRestore();
  });

  it('passes useRunAfterProductionCompileHook to getBuildPluginOptions when enabled', async () => {
    const getBuildPluginOptionsSpy = vi.spyOn(getBuildPluginOptionsModule, 'getBuildPluginOptions');
    vi.spyOn(core, 'loadModule').mockImplementation(() => ({
      sentryWebpackPlugin: () => ({
        _name: 'sentry-webpack-plugin',
      }),
    }));

    await materializeFinalWebpackConfig({
      exportedNextConfig,
      incomingWebpackConfig: serverWebpackConfig,
      incomingWebpackBuildContext: serverBuildContext,
      sentryBuildTimeOptions: {
        useRunAfterProductionCompileHook: true,
      },
    });

    expect(getBuildPluginOptionsSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        useRunAfterProductionCompileHook: true,
      }),
    );

    getBuildPluginOptionsSpy.mockRestore();
  });

  it('passes useRunAfterProductionCompileHook to getBuildPluginOptions when disabled', async () => {
    const getBuildPluginOptionsSpy = vi.spyOn(getBuildPluginOptionsModule, 'getBuildPluginOptions');
    vi.spyOn(core, 'loadModule').mockImplementation(() => ({
      sentryWebpackPlugin: () => ({
        _name: 'sentry-webpack-plugin',
      }),
    }));

    await materializeFinalWebpackConfig({
      exportedNextConfig,
      incomingWebpackConfig: serverWebpackConfig,
      incomingWebpackBuildContext: serverBuildContext,
      sentryBuildTimeOptions: {
        useRunAfterProductionCompileHook: false,
      },
    });

    expect(getBuildPluginOptionsSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        useRunAfterProductionCompileHook: false,
      }),
    );

    getBuildPluginOptionsSpy.mockRestore();
  });

  it('passes useRunAfterProductionCompileHook as undefined when not specified', async () => {
    const getBuildPluginOptionsSpy = vi.spyOn(getBuildPluginOptionsModule, 'getBuildPluginOptions');
    vi.spyOn(core, 'loadModule').mockImplementation(() => ({
      sentryWebpackPlugin: () => ({
        _name: 'sentry-webpack-plugin',
      }),
    }));

    await materializeFinalWebpackConfig({
      exportedNextConfig,
      incomingWebpackConfig: serverWebpackConfig,
      incomingWebpackBuildContext: serverBuildContext,
      sentryBuildTimeOptions: {},
    });

    expect(getBuildPluginOptionsSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        useRunAfterProductionCompileHook: undefined,
      }),
    );

    getBuildPluginOptionsSpy.mockRestore();
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

  describe('edge runtime polyfills', () => {
    it('adds polyfills only for edge runtime in dev mode on Next.js 13', async () => {
      // Mock Next.js version 13 - polyfills should be added
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('13.0.0');

      // Test edge runtime in dev mode with Next.js 13 - should add polyfills
      const edgeDevBuildContext = { ...edgeBuildContext, dev: true };
      const edgeDevConfig = await materializeFinalWebpackConfig({
        exportedNextConfig,
        incomingWebpackConfig: serverWebpackConfig,
        incomingWebpackBuildContext: edgeDevBuildContext,
      });

      const edgeProvidePlugin = edgeDevConfig.plugins?.find(plugin => plugin.constructor.name === 'ProvidePlugin');
      expect(edgeProvidePlugin).toBeDefined();
      expect(edgeDevConfig.resolve?.alias?.perf_hooks).toMatch(/perf_hooks\.js$/);

      vi.restoreAllMocks();
    });

    it('does NOT add polyfills for edge runtime in prod mode even on Next.js 13', async () => {
      // Mock Next.js version 13 - but prod mode should still not add polyfills
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('13.0.0');

      // Test edge runtime in prod mode - should NOT add polyfills
      const edgeProdBuildContext = { ...edgeBuildContext, dev: false };
      const edgeProdConfig = await materializeFinalWebpackConfig({
        exportedNextConfig,
        incomingWebpackConfig: serverWebpackConfig,
        incomingWebpackBuildContext: edgeProdBuildContext,
      });

      const edgeProdProvidePlugin = edgeProdConfig.plugins?.find(plugin => plugin.constructor.name === 'ProvidePlugin');
      expect(edgeProdProvidePlugin).toBeUndefined();

      vi.restoreAllMocks();
    });

    it('does NOT add polyfills for server runtime even on Next.js 13', async () => {
      // Mock Next.js version 13
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('13.0.0');

      // Test server runtime in dev mode - should NOT add polyfills
      const serverDevBuildContext = { ...serverBuildContext, dev: true };
      const serverDevConfig = await materializeFinalWebpackConfig({
        exportedNextConfig,
        incomingWebpackConfig: serverWebpackConfig,
        incomingWebpackBuildContext: serverDevBuildContext,
      });

      const serverProvidePlugin = serverDevConfig.plugins?.find(plugin => plugin.constructor.name === 'ProvidePlugin');
      expect(serverProvidePlugin).toBeUndefined();

      vi.restoreAllMocks();
    });

    it('does NOT add polyfills for client runtime even on Next.js 13', async () => {
      // Mock Next.js version 13
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('13.0.0');

      // Test client runtime in dev mode - should NOT add polyfills
      const clientDevBuildContext = { ...clientBuildContext, dev: true };
      const clientDevConfig = await materializeFinalWebpackConfig({
        exportedNextConfig,
        incomingWebpackConfig: clientWebpackConfig,
        incomingWebpackBuildContext: clientDevBuildContext,
      });

      const clientProvidePlugin = clientDevConfig.plugins?.find(plugin => plugin.constructor.name === 'ProvidePlugin');
      expect(clientProvidePlugin).toBeUndefined();

      vi.restoreAllMocks();
    });

    it('does NOT add polyfills for edge runtime in dev mode on Next.js versions other than 13', async () => {
      const edgeDevBuildContext = { ...edgeBuildContext, dev: true };

      // Test with Next.js 12 - should NOT add polyfills
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('12.3.0');
      const edgeConfigV12 = await materializeFinalWebpackConfig({
        exportedNextConfig,
        incomingWebpackConfig: serverWebpackConfig,
        incomingWebpackBuildContext: edgeDevBuildContext,
      });
      expect(edgeConfigV12.plugins?.find(plugin => plugin.constructor.name === 'ProvidePlugin')).toBeUndefined();
      vi.restoreAllMocks();

      // Test with Next.js 14 - should NOT add polyfills
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('14.0.0');
      const edgeConfigV14 = await materializeFinalWebpackConfig({
        exportedNextConfig,
        incomingWebpackConfig: serverWebpackConfig,
        incomingWebpackBuildContext: edgeDevBuildContext,
      });
      expect(edgeConfigV14.plugins?.find(plugin => plugin.constructor.name === 'ProvidePlugin')).toBeUndefined();
      vi.restoreAllMocks();

      // Test with Next.js 15 - should NOT add polyfills
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.0.0');
      const edgeConfigV15 = await materializeFinalWebpackConfig({
        exportedNextConfig,
        incomingWebpackConfig: serverWebpackConfig,
        incomingWebpackBuildContext: edgeDevBuildContext,
      });
      expect(edgeConfigV15.plugins?.find(plugin => plugin.constructor.name === 'ProvidePlugin')).toBeUndefined();
      vi.restoreAllMocks();

      // Test with undefined Next.js version - should NOT add polyfills
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue(undefined);
      const edgeConfigUndefined = await materializeFinalWebpackConfig({
        exportedNextConfig,
        incomingWebpackConfig: serverWebpackConfig,
        incomingWebpackBuildContext: edgeDevBuildContext,
      });
      expect(edgeConfigUndefined.plugins?.find(plugin => plugin.constructor.name === 'ProvidePlugin')).toBeUndefined();
      vi.restoreAllMocks();
    });
  });

  describe('treeshaking flags', () => {
    it('does not add DefinePlugin when treeshake option is not set', async () => {
      vi.spyOn(core, 'loadModule').mockImplementation(() => ({
        sentryWebpackPlugin: () => ({
          _name: 'sentry-webpack-plugin',
        }),
      }));

      const finalWebpackConfig = await materializeFinalWebpackConfig({
        exportedNextConfig,
        incomingWebpackConfig: serverWebpackConfig,
        incomingWebpackBuildContext: serverBuildContext,
        sentryBuildTimeOptions: {},
      });

      const definePlugin = finalWebpackConfig.plugins?.find(
        plugin => plugin.constructor.name === 'DefinePlugin',
      ) as any;

      // Should not have a DefinePlugin for treeshaking (may have one for __SENTRY_SERVER_MODULES__)
      if (definePlugin) {
        expect(definePlugin.definitions).not.toHaveProperty('__SENTRY_DEBUG__');
        expect(definePlugin.definitions).not.toHaveProperty('__SENTRY_TRACING__');
        expect(definePlugin.definitions).not.toHaveProperty('__RRWEB_EXCLUDE_IFRAME__');
        expect(definePlugin.definitions).not.toHaveProperty('__RRWEB_EXCLUDE_SHADOW_DOM__');
        expect(definePlugin.definitions).not.toHaveProperty('__SENTRY_EXCLUDE_REPLAY_WORKER__');
      }
    });

    it('does not add DefinePlugin when treeshake option is empty object', async () => {
      vi.spyOn(core, 'loadModule').mockImplementation(() => ({
        sentryWebpackPlugin: () => ({
          _name: 'sentry-webpack-plugin',
        }),
      }));

      const finalWebpackConfig = await materializeFinalWebpackConfig({
        exportedNextConfig,
        incomingWebpackConfig: serverWebpackConfig,
        incomingWebpackBuildContext: serverBuildContext,
        sentryBuildTimeOptions: {
          webpack: {
            treeshake: {},
          },
        },
      });

      const definePlugin = finalWebpackConfig.plugins?.find(
        plugin => plugin.constructor.name === 'DefinePlugin',
      ) as any;

      // Should not have treeshaking flags in DefinePlugin
      if (definePlugin) {
        expect(definePlugin.definitions).not.toHaveProperty('__SENTRY_DEBUG__');
        expect(definePlugin.definitions).not.toHaveProperty('__SENTRY_TRACING__');
        expect(definePlugin.definitions).not.toHaveProperty('__RRWEB_EXCLUDE_IFRAME__');
        expect(definePlugin.definitions).not.toHaveProperty('__RRWEB_EXCLUDE_SHADOW_DOM__');
        expect(definePlugin.definitions).not.toHaveProperty('__SENTRY_EXCLUDE_REPLAY_WORKER__');
      }
    });

    it('adds __SENTRY_DEBUG__ flag when debugLogging is true', async () => {
      vi.spyOn(core, 'loadModule').mockImplementation(() => ({
        sentryWebpackPlugin: () => ({
          _name: 'sentry-webpack-plugin',
        }),
      }));

      const finalWebpackConfig = await materializeFinalWebpackConfig({
        exportedNextConfig,
        incomingWebpackConfig: serverWebpackConfig,
        incomingWebpackBuildContext: serverBuildContext,
        sentryBuildTimeOptions: {
          webpack: {
            treeshake: {
              removeDebugLogging: true,
            },
          },
        },
      });

      const definePlugin = finalWebpackConfig.plugins?.find(
        plugin => plugin.constructor.name === 'DefinePlugin' && plugin.definitions?.__SENTRY_DEBUG__ !== undefined,
      ) as any;

      expect(definePlugin).toBeDefined();
      expect(definePlugin.definitions.__SENTRY_DEBUG__).toBe(false);
    });

    it('adds __SENTRY_TRACING__ flag when tracing is true', async () => {
      vi.spyOn(core, 'loadModule').mockImplementation(() => ({
        sentryWebpackPlugin: () => ({
          _name: 'sentry-webpack-plugin',
        }),
      }));

      const finalWebpackConfig = await materializeFinalWebpackConfig({
        exportedNextConfig,
        incomingWebpackConfig: serverWebpackConfig,
        incomingWebpackBuildContext: serverBuildContext,
        sentryBuildTimeOptions: {
          webpack: {
            treeshake: {
              removeTracing: true,
            },
          },
        },
      });

      const definePlugin = finalWebpackConfig.plugins?.find(
        plugin => plugin.constructor.name === 'DefinePlugin' && plugin.definitions?.__SENTRY_TRACING__ !== undefined,
      ) as any;

      expect(definePlugin).toBeDefined();
      expect(definePlugin.definitions.__SENTRY_TRACING__).toBe(false);
    });

    it('adds __RRWEB_EXCLUDE_IFRAME__ flag when excludeReplayIframe is true', async () => {
      vi.spyOn(core, 'loadModule').mockImplementation(() => ({
        sentryWebpackPlugin: () => ({
          _name: 'sentry-webpack-plugin',
        }),
      }));

      const finalWebpackConfig = await materializeFinalWebpackConfig({
        exportedNextConfig,
        incomingWebpackConfig: serverWebpackConfig,
        incomingWebpackBuildContext: serverBuildContext,
        sentryBuildTimeOptions: {
          webpack: {
            treeshake: {
              excludeReplayIframe: true,
            },
          },
        },
      });

      const definePlugin = finalWebpackConfig.plugins?.find(
        plugin =>
          plugin.constructor.name === 'DefinePlugin' && plugin.definitions?.__RRWEB_EXCLUDE_IFRAME__ !== undefined,
      ) as any;

      expect(definePlugin).toBeDefined();
      expect(definePlugin.definitions.__RRWEB_EXCLUDE_IFRAME__).toBe(true);
    });

    it('adds __RRWEB_EXCLUDE_SHADOW_DOM__ flag when excludeReplayShadowDOM is true', async () => {
      vi.spyOn(core, 'loadModule').mockImplementation(() => ({
        sentryWebpackPlugin: () => ({
          _name: 'sentry-webpack-plugin',
        }),
      }));

      const finalWebpackConfig = await materializeFinalWebpackConfig({
        exportedNextConfig,
        incomingWebpackConfig: serverWebpackConfig,
        incomingWebpackBuildContext: serverBuildContext,
        sentryBuildTimeOptions: {
          webpack: {
            treeshake: {
              excludeReplayShadowDOM: true,
            },
          },
        },
      });

      const definePlugin = finalWebpackConfig.plugins?.find(
        plugin =>
          plugin.constructor.name === 'DefinePlugin' && plugin.definitions?.__RRWEB_EXCLUDE_SHADOW_DOM__ !== undefined,
      ) as any;

      expect(definePlugin).toBeDefined();
      expect(definePlugin.definitions.__RRWEB_EXCLUDE_SHADOW_DOM__).toBe(true);
    });

    it('adds __SENTRY_EXCLUDE_REPLAY_WORKER__ flag when excludeReplayCompressionWorker is true', async () => {
      vi.spyOn(core, 'loadModule').mockImplementation(() => ({
        sentryWebpackPlugin: () => ({
          _name: 'sentry-webpack-plugin',
        }),
      }));

      const finalWebpackConfig = await materializeFinalWebpackConfig({
        exportedNextConfig,
        incomingWebpackConfig: serverWebpackConfig,
        incomingWebpackBuildContext: serverBuildContext,
        sentryBuildTimeOptions: {
          webpack: {
            treeshake: {
              excludeReplayCompressionWorker: true,
            },
          },
        },
      });

      const definePlugin = finalWebpackConfig.plugins?.find(
        plugin =>
          plugin.constructor.name === 'DefinePlugin' &&
          plugin.definitions?.__SENTRY_EXCLUDE_REPLAY_WORKER__ !== undefined,
      ) as any;

      expect(definePlugin).toBeDefined();
      expect(definePlugin.definitions.__SENTRY_EXCLUDE_REPLAY_WORKER__).toBe(true);
    });

    it('adds all flags when all treeshake options are enabled', async () => {
      vi.spyOn(core, 'loadModule').mockImplementation(() => ({
        sentryWebpackPlugin: () => ({
          _name: 'sentry-webpack-plugin',
        }),
      }));

      const finalWebpackConfig = await materializeFinalWebpackConfig({
        exportedNextConfig,
        incomingWebpackConfig: serverWebpackConfig,
        incomingWebpackBuildContext: serverBuildContext,
        sentryBuildTimeOptions: {
          webpack: {
            treeshake: {
              removeDebugLogging: true,
              removeTracing: true,
              excludeReplayIframe: true,
              excludeReplayShadowDOM: true,
              excludeReplayCompressionWorker: true,
            },
          },
        },
      });

      const definePlugins = finalWebpackConfig.plugins?.filter(
        plugin => plugin.constructor.name === 'DefinePlugin',
      ) as any[];

      // Find the plugin that has treeshaking flags (there may be another for __SENTRY_SERVER_MODULES__)
      const treeshakePlugin = definePlugins.find(
        plugin =>
          plugin.definitions.__SENTRY_DEBUG__ !== undefined ||
          plugin.definitions.__SENTRY_TRACING__ !== undefined ||
          plugin.definitions.__RRWEB_EXCLUDE_IFRAME__ !== undefined ||
          plugin.definitions.__RRWEB_EXCLUDE_SHADOW_DOM__ !== undefined ||
          plugin.definitions.__SENTRY_EXCLUDE_REPLAY_WORKER__ !== undefined,
      );

      expect(treeshakePlugin).toBeDefined();
      expect(treeshakePlugin.definitions.__SENTRY_DEBUG__).toBe(false);
      expect(treeshakePlugin.definitions.__SENTRY_TRACING__).toBe(false);
      expect(treeshakePlugin.definitions.__RRWEB_EXCLUDE_IFRAME__).toBe(true);
      expect(treeshakePlugin.definitions.__RRWEB_EXCLUDE_SHADOW_DOM__).toBe(true);
      expect(treeshakePlugin.definitions.__SENTRY_EXCLUDE_REPLAY_WORKER__).toBe(true);
    });

    it('does not add flags when treeshake options are false', async () => {
      vi.spyOn(core, 'loadModule').mockImplementation(() => ({
        sentryWebpackPlugin: () => ({
          _name: 'sentry-webpack-plugin',
        }),
      }));

      const finalWebpackConfig = await materializeFinalWebpackConfig({
        exportedNextConfig,
        incomingWebpackConfig: serverWebpackConfig,
        incomingWebpackBuildContext: serverBuildContext,
        sentryBuildTimeOptions: {
          webpack: {
            treeshake: {
              removeDebugLogging: false,
              removeTracing: false,
              excludeReplayIframe: false,
              excludeReplayShadowDOM: false,
              excludeReplayCompressionWorker: false,
            },
          },
        },
      });

      const definePlugin = finalWebpackConfig.plugins?.find(
        plugin => plugin.constructor.name === 'DefinePlugin',
      ) as any;

      // Should not have treeshaking flags
      if (definePlugin) {
        expect(definePlugin.definitions).not.toHaveProperty('__SENTRY_DEBUG__');
        expect(definePlugin.definitions).not.toHaveProperty('__SENTRY_TRACING__');
        expect(definePlugin.definitions).not.toHaveProperty('__RRWEB_EXCLUDE_IFRAME__');
        expect(definePlugin.definitions).not.toHaveProperty('__RRWEB_EXCLUDE_SHADOW_DOM__');
        expect(definePlugin.definitions).not.toHaveProperty('__SENTRY_EXCLUDE_REPLAY_WORKER__');
      }
    });

    it('works for client builds', async () => {
      vi.spyOn(core, 'loadModule').mockImplementation(() => ({
        sentryWebpackPlugin: () => ({
          _name: 'sentry-webpack-plugin',
        }),
      }));

      const finalWebpackConfig = await materializeFinalWebpackConfig({
        exportedNextConfig,
        incomingWebpackConfig: clientWebpackConfig,
        incomingWebpackBuildContext: clientBuildContext,
        sentryBuildTimeOptions: {
          webpack: {
            treeshake: {
              removeDebugLogging: true,
              removeTracing: true,
            },
          },
        },
      });

      const definePlugins = finalWebpackConfig.plugins?.filter(
        plugin => plugin.constructor.name === 'DefinePlugin',
      ) as any[];

      const treeshakePlugin = definePlugins.find(
        plugin =>
          plugin.definitions.__SENTRY_DEBUG__ !== undefined || plugin.definitions.__SENTRY_TRACING__ !== undefined,
      );

      expect(treeshakePlugin).toBeDefined();
      expect(treeshakePlugin.definitions.__SENTRY_DEBUG__).toBe(false);
      expect(treeshakePlugin.definitions.__SENTRY_TRACING__).toBe(false);
    });

    it('works for edge builds', async () => {
      vi.spyOn(core, 'loadModule').mockImplementation(() => ({
        sentryWebpackPlugin: () => ({
          _name: 'sentry-webpack-plugin',
        }),
      }));

      const finalWebpackConfig = await materializeFinalWebpackConfig({
        exportedNextConfig,
        incomingWebpackConfig: serverWebpackConfig,
        incomingWebpackBuildContext: edgeBuildContext,
        sentryBuildTimeOptions: {
          webpack: {
            treeshake: {
              excludeReplayIframe: true,
              excludeReplayShadowDOM: true,
            },
          },
        },
      });

      const definePlugins = finalWebpackConfig.plugins?.filter(
        plugin => plugin.constructor.name === 'DefinePlugin',
      ) as any[];

      const treeshakePlugin = definePlugins.find(
        plugin =>
          plugin.definitions.__RRWEB_EXCLUDE_IFRAME__ !== undefined ||
          plugin.definitions.__RRWEB_EXCLUDE_SHADOW_DOM__ !== undefined,
      );

      expect(treeshakePlugin).toBeDefined();
      expect(treeshakePlugin.definitions.__RRWEB_EXCLUDE_IFRAME__).toBe(true);
      expect(treeshakePlugin.definitions.__RRWEB_EXCLUDE_SHADOW_DOM__).toBe(true);
    });

    it('only adds flags for enabled options', async () => {
      vi.spyOn(core, 'loadModule').mockImplementation(() => ({
        sentryWebpackPlugin: () => ({
          _name: 'sentry-webpack-plugin',
        }),
      }));

      const finalWebpackConfig = await materializeFinalWebpackConfig({
        exportedNextConfig,
        incomingWebpackConfig: serverWebpackConfig,
        incomingWebpackBuildContext: serverBuildContext,
        sentryBuildTimeOptions: {
          webpack: {
            treeshake: {
              removeDebugLogging: true,
              removeTracing: false, // disabled
              excludeReplayIframe: true,
              excludeReplayShadowDOM: false, // disabled
              excludeReplayCompressionWorker: true,
            },
          },
        },
      });

      const definePlugins = finalWebpackConfig.plugins?.filter(
        plugin => plugin.constructor.name === 'DefinePlugin',
      ) as any[];

      const treeshakePlugin = definePlugins.find(
        plugin =>
          plugin.definitions.__SENTRY_DEBUG__ !== undefined ||
          plugin.definitions.__RRWEB_EXCLUDE_IFRAME__ !== undefined ||
          plugin.definitions.__SENTRY_EXCLUDE_REPLAY_WORKER__ !== undefined,
      );

      expect(treeshakePlugin).toBeDefined();
      // Should have enabled flags
      expect(treeshakePlugin.definitions.__SENTRY_DEBUG__).toBe(false);
      expect(treeshakePlugin.definitions.__RRWEB_EXCLUDE_IFRAME__).toBe(true);
      expect(treeshakePlugin.definitions.__SENTRY_EXCLUDE_REPLAY_WORKER__).toBe(true);
      // Should not have disabled flags
      expect(treeshakePlugin.definitions).not.toHaveProperty('__SENTRY_TRACING__');
      expect(treeshakePlugin.definitions).not.toHaveProperty('__RRWEB_EXCLUDE_SHADOW_DOM__');
    });
  });
});
