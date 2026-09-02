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
const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
  /* noop */
});

function getSentrySvelteKitPlugins(options?: Parameters<typeof sentrySvelteKit>[0]): Promise<Plugin[]> {
  return sentrySvelteKit({
    ...options,
  });
}

describe('sentrySvelteKit()', () => {
  it('warns when the removed `unstable_sentryVitePluginOptions` is still set', async () => {
    consoleWarnSpy.mockClear();

    await getSentrySvelteKitPlugins({
      // @ts-expect-error - removed in v11, but JS configs get no type checking
      unstable_sentryVitePluginOptions: { org: 'other-org' },
    });

    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('unstable_sentryVitePluginOptions'));
  });

  // Asserts on the message rather than the call count: SvelteKit emits unrelated build warnings.
  it('does not warn for a config without removed options', async () => {
    consoleWarnSpy.mockClear();

    await getSentrySvelteKitPlugins({ org: 'my-org' });

    expect(consoleWarnSpy).not.toHaveBeenCalledWith(expect.stringContaining('unstable_'));
  });

  it('returns an array of Vite plugins', async () => {
    const plugins = await getSentrySvelteKitPlugins();

    expect(plugins).toBeInstanceOf(Array);
    // 1 kit config resolver + 1 browser-tracing variant resolver + 1 auto instrument plugin
    // + 1 orchestrion plugin + 1 global values injection plugin + 1 modified main plugin
    // + 3 custom plugins
    expect(plugins).toHaveLength(9);
  });

  it('returns the custom sentry source maps upload plugin, unmodified sourcemaps plugins and the auto-instrument plugin by default', async () => {
    const plugins = await getSentrySvelteKitPlugins();
    const pluginNames = plugins.map(plugin => plugin.name);
    expect(pluginNames).toEqual([
      // kit config resolver (must come first so later plugins can await the resolved config):
      'sentry-sveltekit-kit-config-resolver',
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
    expect(plugins).toHaveLength(4); // kit config resolver + browser-tracing variant resolver + auto instrument + orchestrion
  });

  it("doesn't return the sentry source maps plugins if `NODE_ENV` is development", async () => {
    const previousEnv = process.env.NODE_ENV;

    process.env.NODE_ENV = 'development';
    const plugins = await getSentrySvelteKitPlugins({ autoUploadSourceMaps: true, autoInstrument: true });
    const instrumentPlugin = plugins[2];

    expect(plugins).toHaveLength(5); // kit config resolver + browser-tracing variant resolver + auto instrument + orchestrion + global values injection
    expect(instrumentPlugin?.name).toEqual('sentry-auto-instrumentation');

    process.env.NODE_ENV = previousEnv;
  });

  it("doesn't return the auto instrument plugin if autoInstrument is `false`", async () => {
    const plugins = await getSentrySvelteKitPlugins({ autoInstrument: false });
    const pluginNames = plugins.map(plugin => plugin.name);
    expect(plugins).toHaveLength(8); // kit config resolver + browser-tracing variant resolver + orchestrion + global values injection + 1 modified main plugin + 3 custom plugins
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
      },
      { getAdapterOutputDir: expect.any(Function) },
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
        setCommits: {
          auto: true,
        },
      },
      headers: {
        'X-My-Header': 'foo',
      },
      autoInstrument: false,
      adapter: 'vercel',
    });

    expect(makePluginSpy).toHaveBeenCalledWith(
      {
        debug: true,
        org: 'my-org',
        sourcemaps: {
          assets: ['nope/*.js'],
          filesToDeleteAfterUpload: ['baz/*.js'],
        },
        release: {
          inject: false,
          name: '2.0.0',
          setCommits: {
            auto: true,
          },
        },
        headers: {
          'X-My-Header': 'foo',
        },
      },
      { getAdapterOutputDir: expect.any(Function) },
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
    const plugin = plugins[2]!;

    expect(plugin.name).toEqual('sentry-auto-instrumentation');
    expect(makePluginSpy).toHaveBeenCalledWith({
      debug: true,
      load: true,
      serverLoad: false,
      getKitConfig: expect.any(Function),
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

  it('passes release options through', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production'; // Ensure we're not in development mode

    const options: SentrySvelteKitPluginOptions = {
      autoUploadSourceMaps: true,
      release: {
        name: '2.0.0',
        setCommits: {
          auto: true,
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

  it("handles the debug option and doesn't forward the adapter", () => {
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
    // The adapter is resolved through the kit config resolver, not forwarded to the Vite plugin
    const expected: CustomSentryVitePluginOptions = {
      authToken: 'token',
      org: 'org',
      project: 'project',
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

  it('maps `sentryUrl` to the plugin`s `url` option', () => {
    const result = generateVitePluginOptions({
      autoUploadSourceMaps: true,
      sentryUrl: 'https://my.sentry.io',
    });

    expect(result?.url).toBe('https://my.sentry.io');
  });

  it('passes sourcemap settings through untouched', () => {
    const options: SentrySvelteKitPluginOptions = {
      autoUploadSourceMaps: true,
      sourcemaps: {
        assets: ['root/*.js'],
        ignore: ['root/ignore/*.js'],
        filesToDeleteAfterUpload: ['root/delete/*.js'],
      },
    };

    const result = generateVitePluginOptions(options);

    expect(result?.sourcemaps).toEqual({
      assets: ['root/*.js'],
      ignore: ['root/ignore/*.js'],
      filesToDeleteAfterUpload: ['root/delete/*.js'],
    });
  });

  it('passes all top-level settings through to the plugin options', () => {
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
    };

    const result = generateVitePluginOptions(options);

    expect(result).toEqual({
      org: 'root-org',
      project: 'root-project',
      authToken: 'root-token',
      telemetry: true,
      url: 'https://root.sentry.io',
      sourcemaps: {
        assets: ['root/*.js'],
        ignore: ['root/ignore/*.js'],
      },
      release: {
        name: 'root-1.0.0',
        inject: false,
      },
      debug: false,
    });
  });
});
