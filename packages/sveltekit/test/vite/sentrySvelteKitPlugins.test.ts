import { describe, expect, it, vi } from 'vitest';

import type { Plugin } from 'vite';
import * as autoInstrument from '../../src/vite/autoInstrument';
import { generateVitePluginOptions, sentrySvelteKit } from '../../src/vite/sentryVitePlugins';
import * as sourceMaps from '../../src/vite/sourceMaps';
import type { CustomSentryVitePluginOptions, SentrySvelteKitPluginOptions } from '../../src/vite/types';

vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  return {
    ...actual,
    promises: {
      // @ts-expect-error this also exists, I promise!
      ...actual.promises,
      readFile: vi.fn().mockReturnValue('foo'),
    },
  };
});

vi.spyOn(console, 'log').mockImplementation(() => {
  /* noop */
});
vi.spyOn(console, 'warn').mockImplementation(() => {
  /* noop */
});

function getSentrySvelteKitPlugins(options?: Parameters<typeof sentrySvelteKit>[0]): Promise<Plugin[]> {
  return sentrySvelteKit({
    sourceMapsUploadOptions: {
      authToken: 'token',
      org: 'org',
      project: 'project',
      ...options?.sourceMapsUploadOptions,
    },
    ...options,
  });
}

describe('sentrySvelteKit()', () => {
  it('returns an array of Vite plugins', async () => {
    const plugins = await getSentrySvelteKitPlugins();

    expect(plugins).toBeInstanceOf(Array);
    // 1 auto instrument plugin + 5 source maps plugins
    expect(plugins).toHaveLength(8);
  });

  it('returns the custom sentry source maps upload plugin, unmodified sourcemaps plugins and the auto-instrument plugin by default', async () => {
    const plugins = await getSentrySvelteKitPlugins();
    const pluginNames = plugins.map(plugin => plugin.name);
    expect(pluginNames).toEqual([
      // auto instrument plugin:
      'sentry-auto-instrumentation',
      // default source maps plugins:
      'sentry-telemetry-plugin',
      'sentry-vite-release-injection-plugin',
      'sentry-vite-debug-id-injection-plugin',
      'sentry-sveltekit-update-source-map-setting-plugin',
      // custom release plugin:
      'sentry-sveltekit-release-management-plugin',
      // custom source maps plugin:
      'sentry-sveltekit-debug-id-upload-plugin',
      // custom deletion plugin
      'sentry-sveltekit-file-deletion-plugin',
    ]);
  });

  it("doesn't return the sentry source maps plugins if autoUploadSourcemaps is `false`", async () => {
    const plugins = await getSentrySvelteKitPlugins({ autoUploadSourceMaps: false });
    expect(plugins).toHaveLength(1);
  });

  it("doesn't return the sentry source maps plugins if `NODE_ENV` is development", async () => {
    const previousEnv = process.env.NODE_ENV;

    process.env.NODE_ENV = 'development';
    const plugins = await getSentrySvelteKitPlugins({ autoUploadSourceMaps: true, autoInstrument: true });
    const instrumentPlugin = plugins[0];

    expect(plugins).toHaveLength(1);
    expect(instrumentPlugin?.name).toEqual('sentry-auto-instrumentation');

    process.env.NODE_ENV = previousEnv;
  });

  it("doesn't return the auto instrument plugin if autoInstrument is `false`", async () => {
    const plugins = await getSentrySvelteKitPlugins({ autoInstrument: false });
    const pluginNames = plugins.map(plugin => plugin.name);
    expect(plugins).toHaveLength(7);
    expect(pluginNames).not.toContain('sentry-upload-source-maps');
  });

  it('passes user-specified vite plugin options to the custom sentry source maps plugin', async () => {
    const makePluginSpy = vi.spyOn(sourceMaps, 'makeCustomSentryVitePlugins');
    await getSentrySvelteKitPlugins({
      debug: true,
      sourceMapsUploadOptions: {
        sourcemaps: {
          assets: ['foo/*.js'],
          ignore: ['bar/*.js'],
          filesToDeleteAfterUpload: ['baz/*.js'],
        },
      },
      autoInstrument: false,
      adapter: 'vercel',
    });

    expect(makePluginSpy).toHaveBeenCalledWith({
      debug: true,
      sourcemaps: {
        assets: ['foo/*.js'],
        ignore: ['bar/*.js'],
        filesToDeleteAfterUpload: ['baz/*.js'],
      },
      adapter: 'vercel',
    });
  });

  it('passes user-specified vite plugin options to the custom sentry source maps plugin', async () => {
    const makePluginSpy = vi.spyOn(sourceMaps, 'makeCustomSentryVitePlugins');
    await getSentrySvelteKitPlugins({
      debug: true,
      sourceMapsUploadOptions: {
        org: 'my-org',
        sourcemaps: {
          assets: ['nope/*.js'],
          filesToDeleteAfterUpload: ['baz/*.js'],
        },
        release: {
          inject: false,
          name: '2.0.0',
        },
        unstable_sentryVitePluginOptions: {
          org: 'other-org',
          sourcemaps: {
            assets: ['foo/*.js'],
            ignore: ['bar/*.js'],
          },
          release: {
            name: '3.0.0',
            setCommits: {
              auto: true,
            },
          },
          headers: {
            'X-My-Header': 'foo',
          },
        },
      },
      autoInstrument: false,
      adapter: 'vercel',
    });

    expect(makePluginSpy).toHaveBeenCalledWith({
      debug: true,
      org: 'other-org',
      sourcemaps: {
        assets: ['foo/*.js'],
        ignore: ['bar/*.js'],
        filesToDeleteAfterUpload: ['baz/*.js'],
      },
      release: {
        inject: false,
        name: '3.0.0',
        setCommits: {
          auto: true,
        },
      },
      headers: {
        'X-My-Header': 'foo',
      },
      adapter: 'vercel',
    });
  });

  it('passes user-specified options to the auto instrument plugin', async () => {
    const makePluginSpy = vi.spyOn(autoInstrument, 'makeAutoInstrumentationPlugin');
    const plugins = await getSentrySvelteKitPlugins({
      debug: true,
      autoInstrument: {
        load: true,
        serverLoad: false,
      },
      // just to ignore the source maps plugin:
      autoUploadSourceMaps: false,
    });
    const plugin = plugins[0];

    expect(plugin.name).toEqual('sentry-auto-instrumentation');
    expect(makePluginSpy).toHaveBeenCalledWith({
      debug: true,
      load: true,
      serverLoad: false,
    });
  });
});

describe('generateVitePluginOptions', () => {
  it('should return null if no relevant options are provided', () => {
    const options: SentrySvelteKitPluginOptions = {};
    const result = generateVitePluginOptions(options);
    expect(result).toBeNull();
  });

  it('should use default `debug` value if only default options are provided', () => {
    const options: SentrySvelteKitPluginOptions = { autoUploadSourceMaps: true, autoInstrument: true, debug: false };
    const expected: CustomSentryVitePluginOptions = {
      debug: false,
    };
    const result = generateVitePluginOptions(options);
    expect(result).toEqual(expected);
  });

  it('should apply user-defined sourceMapsUploadOptions', () => {
    const options: SentrySvelteKitPluginOptions = {
      autoUploadSourceMaps: true,
      sourceMapsUploadOptions: {
        authToken: 'token',
        org: 'org',
        project: 'project',
        sourcemaps: {
          assets: ['foo/*.js'],
        },
      },
    };
    const expected: CustomSentryVitePluginOptions = {
      authToken: 'token',
      org: 'org',
      project: 'project',
      sourcemaps: {
        assets: ['foo/*.js'],
      },
    };
    const result = generateVitePluginOptions(options);
    expect(result).toEqual(expected);
  });

  it('should override options with unstable_sentryVitePluginOptions', () => {
    const options: SentrySvelteKitPluginOptions = {
      autoUploadSourceMaps: true,
      sourceMapsUploadOptions: {
        authToken: 'token',
        org: 'org',
        project: 'project',
        sourcemaps: {
          assets: ['foo/*.js'],
        },
        unstable_sentryVitePluginOptions: {
          org: 'unstable-org',
          sourcemaps: {
            assets: ['unstable/*.js'],
          },
        },
      },
    };
    const expected: CustomSentryVitePluginOptions = {
      authToken: 'token',
      org: 'unstable-org',
      project: 'project',
      sourcemaps: {
        assets: ['unstable/*.js'],
      },
    };
    const result = generateVitePluginOptions(options);
    expect(result).toEqual(expected);
  });

  it('should merge release options correctly', () => {
    const options: SentrySvelteKitPluginOptions = {
      autoUploadSourceMaps: true,
      sourceMapsUploadOptions: {
        release: {
          name: '1.0.0',
        },
        unstable_sentryVitePluginOptions: {
          release: {
            name: '2.0.0',
            setCommits: {
              auto: true,
            },
          },
        },
      },
    };
    const expected: CustomSentryVitePluginOptions = {
      release: {
        name: '2.0.0',
        setCommits: {
          auto: true,
        },
      },
    };
    const result = generateVitePluginOptions(options);
    expect(result).toEqual(expected);
  });

  it('should handle adapter and debug options correctly', () => {
    const options: SentrySvelteKitPluginOptions = {
      autoUploadSourceMaps: true,
      adapter: 'vercel',
      debug: true,
      sourceMapsUploadOptions: {
        authToken: 'token',
        org: 'org',
        project: 'project',
      },
    };
    const expected: CustomSentryVitePluginOptions = {
      authToken: 'token',
      org: 'org',
      project: 'project',
      adapter: 'vercel',
      debug: true,
    };
    const result = generateVitePluginOptions(options);
    expect(result).toEqual(expected);
  });

  it('should apply bundleSizeOptimizations AND sourceMapsUploadOptions when both are set', () => {
    const options: SentrySvelteKitPluginOptions = {
      bundleSizeOptimizations: {
        excludeTracing: true,
        excludeReplayWorker: true,
        excludeDebugStatements: false,
      },
      autoUploadSourceMaps: true,
      sourceMapsUploadOptions: {
        authToken: 'token',
        org: 'org',
        project: 'project',
        sourcemaps: {
          assets: ['foo/*.js'],
        },
      },
    };
    const expected = {
      bundleSizeOptimizations: {
        excludeTracing: true,
        excludeReplayWorker: true,
        excludeDebugStatements: false,
      },
      authToken: 'token',
      org: 'org',
      project: 'project',
      sourcemaps: {
        assets: ['foo/*.js'],
      },
    };
    const result = generateVitePluginOptions(options);
    expect(result).toEqual(expected);
  });
});
