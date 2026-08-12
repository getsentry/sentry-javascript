import type { Plugin } from 'vite';
import { describe, expect, it, vi } from 'vitest';
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

// Stub the orchestrion plugin so these stay pure wiring tests (no apm code transformer pulled in).
// Mirror the real plugin's contract: `buildTimeInstrumentation: false` yields the inert variant.
const orchestrionVite = vi.fn((options?: { buildTimeInstrumentation?: boolean }) => ({
  name: options?.buildTimeInstrumentation === false ? 'sentry-orchestrion-disabled' : 'sentry-orchestrion-vite',
}));
vi.mock('@sentry/server-utils/orchestrion/vite', () => ({
  sentryOrchestrionPlugin: (options?: { buildTimeInstrumentation?: boolean }) => orchestrionVite(options),
}));

vi.spyOn(console, 'log').mockImplementation(() => {
  /* noop */
});
vi.spyOn(console, 'warn').mockImplementation(() => {
  /* noop */
});

function getSentrySvelteKitPlugins(options?: Parameters<typeof sentrySvelteKit>[0]): Promise<Plugin[]> {
  return sentrySvelteKit({
    ...options,
  });
}

describe('sentrySvelteKit()', () => {
  it('returns an array of Vite plugins', async () => {
    const plugins = await getSentrySvelteKitPlugins();

    expect(plugins).toBeInstanceOf(Array);
    // 1 browser-tracing variant resolver + 1 auto instrument plugin + 1 orchestrion plugin
    // + 1 global values injection plugin + 1 modified main plugin + 3 custom plugins
    expect(plugins).toHaveLength(8);
  });

  it('returns the custom sentry source maps upload plugin, unmodified sourcemaps plugins and the auto-instrument plugin by default', async () => {
    const plugins = await getSentrySvelteKitPlugins();
    const pluginNames = plugins.map(plugin => plugin.name);
    expect(pluginNames).toEqual([
      // browser-tracing variant resolver:
      'sentry-sveltekit-browser-tracing-variant',
      // auto instrument plugin:
      'sentry-auto-instrumentation',
      // orchestrion build-time instrumentation plugin:
      'sentry-orchestrion-vite',
      // global values injection plugin:
      'sentry-sveltekit-global-values-injection-plugin',
      // modified main plugin (writeBundle deferred to closeBundle):
      'sentry-vite-plugin',
      'sentry-sveltekit-update-source-map-setting-plugin',
      'sentry-sveltekit-files-to-delete-after-upload-setting-plugin',
      // custom source maps plugin (sorcery flattening + deferred upload):
      'sentry-sveltekit-debug-id-upload-plugin',
    ]);
  });

  it("doesn't return the sentry source maps plugins if autoUploadSourcemaps is `false`", async () => {
    const plugins = await getSentrySvelteKitPlugins({ autoUploadSourceMaps: false });
    expect(plugins).toHaveLength(3); // browser-tracing variant resolver + auto instrument + orchestrion
  });

  it("doesn't return the sentry source maps plugins if `NODE_ENV` is development", async () => {
    const previousEnv = process.env.NODE_ENV;

    process.env.NODE_ENV = 'development';
    const plugins = await getSentrySvelteKitPlugins({ autoUploadSourceMaps: true, autoInstrument: true });
    const instrumentPlugin = plugins[1];

    expect(plugins).toHaveLength(4); // browser-tracing variant resolver + auto instrument + orchestrion + global values injection
    expect(instrumentPlugin?.name).toEqual('sentry-auto-instrumentation');

    process.env.NODE_ENV = previousEnv;
  });

  it("doesn't return the auto instrument plugin if autoInstrument is `false`", async () => {
    const plugins = await getSentrySvelteKitPlugins({ autoInstrument: false });
    const pluginNames = plugins.map(plugin => plugin.name);
    expect(plugins).toHaveLength(7); // browser-tracing variant resolver + orchestrion + global values injection + 1 modified main plugin + 3 custom plugins
    expect(pluginNames).not.toContain('sentry-auto-instrumentation');
  });

  it('adds the orchestrion plugin by default', async () => {
    const plugins = await getSentrySvelteKitPlugins();
    expect(plugins.map(plugin => plugin.name)).toContain('sentry-orchestrion-vite');
  });

  it('adds an inert orchestrion plugin when `buildTimeInstrumentation` is `false`', async () => {
    orchestrionVite.mockClear();
    const plugins = await getSentrySvelteKitPlugins({ buildTimeInstrumentation: false });
    const pluginNames = plugins.map(plugin => plugin.name);
    expect(orchestrionVite).toHaveBeenCalledWith({ buildTimeInstrumentation: false });
    expect(pluginNames).toContain('sentry-orchestrion-disabled');
    expect(pluginNames).not.toContain('sentry-orchestrion-vite');
  });

  it('adds the orchestrion plugin with the same options regardless of adapter', async () => {
    orchestrionVite.mockClear();
    const plugins = await getSentrySvelteKitPlugins({ adapter: 'cloudflare' });
    expect(orchestrionVite).toHaveBeenCalledWith({ buildTimeInstrumentation: undefined });
    expect(plugins.map(plugin => plugin.name)).toContain('sentry-orchestrion-vite');

    orchestrionVite.mockClear();
    await getSentrySvelteKitPlugins({ adapter: 'node' });
    expect(orchestrionVite).toHaveBeenCalledWith({ buildTimeInstrumentation: undefined });
  });

  it('passes user-specified vite plugin options to the custom sentry source maps plugin', async () => {
    const makePluginSpy = vi.spyOn(sourceMaps, 'makeCustomSentryVitePlugins');
    await getSentrySvelteKitPlugins({
      debug: true,
      sourcemaps: {
        assets: ['foo/*.js'],
        ignore: ['bar/*.js'],
        filesToDeleteAfterUpload: ['baz/*.js'],
      },
      autoInstrument: false,
      adapter: 'vercel',
    });

    expect(makePluginSpy).toHaveBeenCalledWith(
      {
        debug: true,
        sourcemaps: {
          assets: ['foo/*.js'],
          ignore: ['bar/*.js'],
          filesToDeleteAfterUpload: ['baz/*.js'],
        },
        adapter: 'vercel',
      },
      {},
    );
  });

  it('passes user-specified vite plugin options to the custom sentry source maps plugin', async () => {
    const makePluginSpy = vi.spyOn(sourceMaps, 'makeCustomSentryVitePlugins');
    await getSentrySvelteKitPlugins({
      debug: true,
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
      autoInstrument: false,
      adapter: 'vercel',
    });

    expect(makePluginSpy).toHaveBeenCalledWith(
      {
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
      },
      {},
    );
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
    const plugin = plugins[1]!;

    expect(plugin.name).toEqual('sentry-auto-instrumentation');
    expect(makePluginSpy).toHaveBeenCalledWith({
      debug: true,
      load: true,
      serverLoad: false,
      onlyInstrumentClient: false,
    });
  });
});

describe('generateVitePluginOptions', () => {
  it('returns null if no relevant options are provided', () => {
    const options: SentrySvelteKitPluginOptions = {};
    const result = generateVitePluginOptions(options);
    expect(result).toBeNull();
  });

  it('passes applicationKey through to vite plugin options', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const options: SentrySvelteKitPluginOptions = {
      autoUploadSourceMaps: true,
      applicationKey: 'my-app-key',
    };
    const result = generateVitePluginOptions(options);
    expect(result).toEqual(expect.objectContaining({ applicationKey: 'my-app-key' }));

    process.env.NODE_ENV = originalEnv;
  });

  it('uses default `debug` value if only default options are provided', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production'; // Ensure we're not in development mode

    const options: SentrySvelteKitPluginOptions = { autoUploadSourceMaps: true, autoInstrument: true, debug: false };
    const expected: CustomSentryVitePluginOptions = {
      debug: false,
    };
    const result = generateVitePluginOptions(options);
    expect(result).toEqual(expected);

    process.env.NODE_ENV = originalEnv;
  });

  it('applies user-defined source maps options', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production'; // Ensure we're not in development mode

    const options: SentrySvelteKitPluginOptions = {
      autoUploadSourceMaps: true,
      authToken: 'token',
      org: 'org',
      project: 'project',
      sourcemaps: {
        assets: ['foo/*.js'],
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

    process.env.NODE_ENV = originalEnv;
  });

  it('overrides options with unstable_sentryVitePluginOptions', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production'; // Ensure we're not in development mode

    const options: SentrySvelteKitPluginOptions = {
      autoUploadSourceMaps: true,
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

    process.env.NODE_ENV = originalEnv;
  });

  it('merges release options correctly', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production'; // Ensure we're not in development mode

    const options: SentrySvelteKitPluginOptions = {
      autoUploadSourceMaps: true,
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

    process.env.NODE_ENV = originalEnv;
  });

  it('handles adapter and debug options correctly', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production'; // Ensure we're not in development mode

    const options: SentrySvelteKitPluginOptions = {
      autoUploadSourceMaps: true,
      adapter: 'vercel',
      debug: true,
      authToken: 'token',
      org: 'org',
      project: 'project',
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

    process.env.NODE_ENV = originalEnv;
  });

  it('applies bundleSizeOptimizations AND source maps options when both are set', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production'; // Ensure we're not in development mode

    const options: SentrySvelteKitPluginOptions = {
      bundleSizeOptimizations: {
        excludeTracing: true,
        excludeReplayWorker: true,
        excludeDebugStatements: false,
      },
      autoUploadSourceMaps: true,
      authToken: 'token',
      org: 'org',
      project: 'project',
      sourcemaps: {
        assets: ['foo/*.js'],
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

    process.env.NODE_ENV = originalEnv;
  });

  it.each([
    {
      testName: 'org setting precedence',
      options: {
        autoUploadSourceMaps: true,
        org: 'root-org',
        unstable_sentryVitePluginOptions: {
          org: 'new-unstable-org',
        },
      },
      expectedOrg: 'new-unstable-org',
    },
    {
      testName: 'project setting precedence',
      options: {
        autoUploadSourceMaps: true,
        project: 'root-project',
        unstable_sentryVitePluginOptions: {
          project: 'new-unstable-project',
        },
      },
      expectedProject: 'new-unstable-project',
    },
    {
      testName: 'authToken setting precedence',
      options: {
        autoUploadSourceMaps: true,
        authToken: 'root-token',
        unstable_sentryVitePluginOptions: {
          authToken: 'new-unstable-token',
        },
      },
      expectedAuthToken: 'new-unstable-token',
    },
    {
      testName: 'telemetry setting precedence',
      options: {
        autoUploadSourceMaps: true,
        telemetry: true,
        unstable_sentryVitePluginOptions: {
          telemetry: false,
        },
      },
      expectedTelemetry: false,
    },
    {
      testName: 'url setting precedence',
      options: {
        autoUploadSourceMaps: true,
        sentryUrl: 'https://root.sentry.io',
        unstable_sentryVitePluginOptions: {
          url: 'https://new-unstable.sentry.io',
        },
      },
      expectedUrl: 'https://new-unstable.sentry.io',
    },
  ])(
    'should use correct $testName',
    ({ options, expectedOrg, expectedProject, expectedAuthToken, expectedTelemetry, expectedUrl }) => {
      const result = generateVitePluginOptions(options as SentrySvelteKitPluginOptions);

      if (expectedOrg !== undefined) {
        expect(result?.org).toBe(expectedOrg);
      }
      if (expectedProject !== undefined) {
        expect(result?.project).toBe(expectedProject);
      }
      if (expectedAuthToken !== undefined) {
        expect(result?.authToken).toBe(expectedAuthToken);
      }
      if (expectedTelemetry !== undefined) {
        expect(result?.telemetry).toBe(expectedTelemetry);
      }
      if (expectedUrl !== undefined) {
        expect(result?.url).toBe(expectedUrl);
      }
    },
  );

  it('should handle sourcemap settings with correct order of overrides', () => {
    const options: SentrySvelteKitPluginOptions = {
      autoUploadSourceMaps: true,
      sourcemaps: {
        assets: ['root/*.js'],
        ignore: ['root/ignore/*.js'],
        filesToDeleteAfterUpload: ['root/delete/*.js'],
      },
      unstable_sentryVitePluginOptions: {
        sourcemaps: {
          assets: ['new-unstable/*.js'],
          filesToDeleteAfterUpload: ['new-unstable/delete/*.js'],
        },
      },
    };

    const result = generateVitePluginOptions(options);

    expect(result?.sourcemaps).toEqual({
      assets: ['new-unstable/*.js'], // unstable takes precedence
      ignore: ['root/ignore/*.js'], // from root (not overridden by unstable)
      filesToDeleteAfterUpload: ['new-unstable/delete/*.js'], // unstable takes precedence
    });
  });

  it('should handle release settings with correct order of overrides', () => {
    const newReleaseOptions = {
      name: 'root-release',
      inject: true,
    };
    const newUnstableReleaseOptions = {
      name: 'new-unstable-release',
      deploy: {
        env: 'production',
      },
    };

    const options: SentrySvelteKitPluginOptions = {
      autoUploadSourceMaps: true,
      release: newReleaseOptions,
      unstable_sentryVitePluginOptions: { release: newUnstableReleaseOptions },
    };

    const result = generateVitePluginOptions(options);

    expect(result?.release).toEqual({
      name: newUnstableReleaseOptions.name, // from unstable
      inject: newReleaseOptions.inject, // from root (not overridden by unstable)
      deploy: {
        env: 'production', // from unstable
      },
    });
  });

  it('should handle complex override scenario with all settings', () => {
    const options: SentrySvelteKitPluginOptions = {
      autoUploadSourceMaps: true,
      org: 'root-org',
      project: 'root-project',
      authToken: 'root-token',
      telemetry: true,
      sentryUrl: 'https://root.sentry.io',
      debug: false,
      sourcemaps: {
        assets: ['root/*.js'],
        ignore: ['root/ignore/*.js'],
      },
      release: {
        name: 'root-1.0.0',
        inject: false,
      },
      unstable_sentryVitePluginOptions: {
        org: 'new-unstable-org',
        authToken: 'new-unstable-token',
        sourcemaps: {
          assets: ['new-unstable/*.js'],
          filesToDeleteAfterUpload: ['new-unstable/delete/*.js'],
        },
        release: {
          name: 'new-unstable-1.0.0',
        },
      },
    };

    const result = generateVitePluginOptions(options);

    expect(result).toEqual({
      org: 'new-unstable-org',
      project: 'root-project',
      authToken: 'new-unstable-token',
      telemetry: true,
      url: 'https://root.sentry.io',
      sourcemaps: {
        assets: ['new-unstable/*.js'],
        ignore: ['root/ignore/*.js'],
        filesToDeleteAfterUpload: ['new-unstable/delete/*.js'],
      },
      release: {
        name: 'new-unstable-1.0.0',
        inject: false,
      },
      adapter: undefined,
      debug: false,
    });
  });
});
