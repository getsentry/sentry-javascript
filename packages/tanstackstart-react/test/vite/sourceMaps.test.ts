// @vitest-environment node
import type { SentryVitePluginInternalOptions } from '@sentry/bundler-plugins/vite';
import type { UserConfig } from 'vite';
import { mergeConfig } from 'vite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as path from 'path';
import {
  createSourceMapState,
  getUpdatedSourceMapSettings,
  makeAddSentryVitePlugin,
  makeEnableSourceMapsVitePlugin,
  rewriteTanstackStartSource,
} from '../../src/vite/sourceMaps';

const mockedSentryVitePlugin = {
  name: 'sentry-vite-debug-id-upload-plugin',
  writeBundle: vi.fn(),
};

let sentryVitePluginOptions: SentryVitePluginInternalOptions | undefined;

const sentryVitePluginSpy = vi.fn((options: SentryVitePluginInternalOptions) => {
  sentryVitePluginOptions = options;
  return [mockedSentryVitePlugin];
});

vi.mock('@sentry/bundler-plugins/vite', () => ({
  sentryVitePlugin: (options: SentryVitePluginInternalOptions) => sentryVitePluginSpy(options),
}));

beforeEach(() => {
  vi.clearAllMocks();
  sentryVitePluginOptions = undefined;
});

describe('makeEnableSourceMapsVitePlugin()', () => {
  it('returns a plugin to enable source maps', () => {
    const sourceMapsConfigPlugins = makeEnableSourceMapsVitePlugin({});
    const enableSourceMapPlugin = sourceMapsConfigPlugins[0];

    expect(enableSourceMapPlugin?.name).toEqual('sentry-tanstackstart-react-source-maps');
    expect(enableSourceMapPlugin?.apply).toEqual('build');
    expect(enableSourceMapPlugin?.enforce).toEqual('post');
    expect(enableSourceMapPlugin?.config).toEqual(expect.any(Function));

    expect(sourceMapsConfigPlugins).toHaveLength(1);
  });

  it.each([
    { label: 'the user set no source maps', userConfig: {}, expected: true },
    { label: 'the user set `build.sourcemap`', userConfig: { build: { sourcemap: true } }, expected: false },
    { label: 'the user set `build.sourcemap: false`', userConfig: { build: { sourcemap: false } }, expected: false },
    {
      label: 'the user set `build.rolldownOptions.output.sourcemap`',
      userConfig: { build: { rolldownOptions: { output: { sourcemap: true } } } },
      expected: false,
    },
    {
      label: "an environment output sets `sourcemap: 'hidden'`",
      userConfig: { environments: { client: { build: { rolldownOptions: { output: { sourcemap: 'hidden' } } } } } },
      expected: true,
    },
    {
      label: 'an environment output sets `sourcemap: true`',
      userConfig: { environments: { client: { build: { rollupOptions: { output: { sourcemap: true } } } } } },
      expected: true,
    },
  ] as const)('records whether it enabled the source maps when $label', ({ userConfig, expected }) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const state = { ...createSourceMapState(), sdkEnabledSourceMaps: !expected };
    const plugin = makeEnableSourceMapsVitePlugin({}, state)[0]!;
    (plugin.config as (config: UserConfig) => UserConfig)(structuredClone(userConfig) as UserConfig);

    expect(state.sdkEnabledSourceMaps).toBe(expected);
  });

  it.each([undefined, false, true, 'hidden', 'inline'] as const)(
    'preserves user config without duplicating arrays when sourcemap is %s',
    sourcemap => {
      const plugin = makeEnableSourceMapsVitePlugin({})[0]!;
      const configHook = plugin.config as (config: UserConfig) => UserConfig;
      const userConfig: UserConfig = {
        optimizeDeps: { include: ['react'] },
        build: {
          sourcemap,
          outDir: 'custom-dist',
          rollupOptions: { plugins: [{ name: 'asset-transform' }] },
        },
      };

      const merged = mergeConfig(userConfig, configHook(userConfig));

      expect(merged).toEqual({
        optimizeDeps: { include: ['react'] },
        build: {
          sourcemap: sourcemap ?? 'hidden',
          outDir: 'custom-dist',
          rollupOptions: { plugins: [{ name: 'asset-transform' }] },
          rolldownOptions: { plugins: [{ name: 'asset-transform' }] },
        },
      });
    },
  );
});

describe('makeAddSentryVitePlugin()', () => {
  it('passes user-specified vite plugin options to vite plugin', () => {
    const errorHandler = vi.fn();
    makeAddSentryVitePlugin({
      org: 'my-org',
      authToken: 'my-token',
      sentryUrl: 'https://custom.sentry.io',
      headers: { 'X-Custom-Header': 'value' },
      silent: true,
      errorHandler,
      release: {
        name: 'my-release',
        inject: true,
        create: true,
        finalize: true,
        dist: 'dist-1',
      },
      sourcemaps: {
        assets: ['dist/**/*.js'],
        disable: false,
        ignore: ['node_modules/**'],
        filesToDeleteAfterUpload: ['baz/*.js'],
      },
      bundleSizeOptimizations: {
        excludeTracing: true,
      },
    });

    expect(sentryVitePluginOptions?.sourcemaps?.filesToDeleteAfterUpload).toEqual(['baz/*.js']);

    expect(sentryVitePluginSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        org: 'my-org',
        authToken: 'my-token',
        url: 'https://custom.sentry.io',
        headers: { 'X-Custom-Header': 'value' },
        silent: true,
        errorHandler,
        release: {
          name: 'my-release',
          inject: true,
          create: true,
          finalize: true,
          dist: 'dist-1',
        },
        bundleSizeOptimizations: {
          excludeTracing: true,
        },
      }),
    );
  });

  it('passes moduleMetadata and sourcemaps hooks to sentryVitePlugin', () => {
    const rewriteSources = (source: string): string => source;
    const resolveSourceMap = (artifactPath: string): string => `${artifactPath}.map`;

    makeAddSentryVitePlugin({
      moduleMetadata: { team: 'sdk' },
      sourcemaps: { rewriteSources, resolveSourceMap },
    });

    expect(sentryVitePluginSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        moduleMetadata: { team: 'sdk' },
        sourcemaps: expect.objectContaining({ rewriteSources, resolveSourceMap }),
      }),
    );
  });

  it('passes applicationKey to sentryVitePlugin', () => {
    makeAddSentryVitePlugin({
      applicationKey: 'my-app-key',
    });

    expect(sentryVitePluginSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationKey: 'my-app-key',
      }),
    );
  });

  it.each([
    { name: 'client', consumer: 'client', expected: true },
    { name: 'ssr', consumer: 'server', expected: false },
    { name: 'nitro', consumer: 'server', expected: true },
  ] as const)(
    'applies the Sentry Vite plugin to the $name environment of a Nitro build: $expected',
    ({ name, consumer, expected }) => {
      const sentryPlugin = makeAddSentryVitePlugin({}).find(plugin => plugin.name === mockedSentryVitePlugin.name);
      const environment = { name, config: { consumer, environments: { client: {}, ssr: {}, nitro: {} } } };

      expect(sentryPlugin).toBeDefined();
      expect((sentryPlugin?.applyToEnvironment as unknown as (env: typeof environment) => boolean)(environment)).toBe(
        expected,
      );
    },
  );

  describe('deleteSourcemapsAfterUpload', () => {
    /** Calls the function options like the bundler plugin, which passes an environment with its own setting. */
    function decide(environment?: string) {
      const { deleteSourcemapsAfterUpload, sdkEnabledSourceMaps } = sentryVitePluginOptions?.sourcemaps ?? {};
      return {
        delete:
          typeof deleteSourcemapsAfterUpload === 'function'
            ? deleteSourcemapsAfterUpload(environment)
            : deleteSourcemapsAfterUpload,
        sdkEnabled:
          typeof sdkEnabledSourceMaps === 'function' ? sdkEnabledSourceMaps(environment) : sdkEnabledSourceMaps,
      };
    }

    it('reads the state when the bundler plugin decides, not when the plugin is created', () => {
      const state = createSourceMapState();
      makeAddSentryVitePlugin({}, state);

      expect(decide()).toEqual({ delete: undefined, sdkEnabled: false });
      state.sdkEnabledSourceMaps = true;
      expect(decide()).toEqual({ delete: true, sdkEnabled: true });
    });

    it.each([
      {
        label: 'the SDK enabled the top-level source maps',
        state: { sdkEnabledSourceMaps: true, sdkEnabledNitroSourceMaps: false },
        expected: { top: true, ssr: undefined, nitro: undefined },
      },
      {
        label: 'the SDK enabled the Nitro source maps',
        state: { sdkEnabledSourceMaps: false, sdkEnabledNitroSourceMaps: true },
        expected: { top: undefined, ssr: undefined, nitro: true },
      },
      {
        label: 'the SDK enabled both',
        state: { sdkEnabledSourceMaps: true, sdkEnabledNitroSourceMaps: true },
        expected: { top: true, ssr: undefined, nitro: true },
      },
      {
        label: 'the user enabled all source maps',
        state: { sdkEnabledSourceMaps: false, sdkEnabledNitroSourceMaps: false },
        expected: { top: undefined, ssr: undefined, nitro: undefined },
      },
    ])('asks for deletion of the source maps the SDK enabled when $label', ({ state, expected }) => {
      makeAddSentryVitePlugin({}, state);

      expect({ top: decide().delete, ssr: decide('ssr').delete, nitro: decide('nitro').delete }).toEqual(expected);
      expect({
        top: decide().sdkEnabled,
        ssr: decide('ssr').sdkEnabled,
        nitro: decide('nitro').sdkEnabled,
      }).toEqual({ top: expected.top === true, ssr: false, nitro: expected.nitro === true });
    });

    // A client environment with its own setting was set by the user, because the SDK sets only the top level.
    it('keeps the source maps of an environment that the user configured', () => {
      makeAddSentryVitePlugin({}, { sdkEnabledSourceMaps: true, sdkEnabledNitroSourceMaps: true });

      expect(decide('client')).toEqual({ delete: undefined, sdkEnabled: false });
    });

    it.each([true, false])('passes a user-set `deleteSourcemapsAfterUpload: %s` through', value => {
      makeAddSentryVitePlugin(
        { sourcemaps: { deleteSourcemapsAfterUpload: value } },
        { sdkEnabledSourceMaps: !value, sdkEnabledNitroSourceMaps: !value },
      );

      expect([decide().delete, decide('ssr').delete, decide('nitro').delete]).toEqual([value, value, value]);
    });

    it('passes a user-set filesToDeleteAfterUpload through and keeps its own deletion', () => {
      makeAddSentryVitePlugin(
        { sourcemaps: { filesToDeleteAfterUpload: ['dist/**/*.map'] } },
        { sdkEnabledSourceMaps: true, sdkEnabledNitroSourceMaps: true },
      );

      expect(sentryVitePluginOptions?.sourcemaps?.filesToDeleteAfterUpload).toEqual(['dist/**/*.map']);
      expect([decide().delete, decide('ssr').delete, decide('nitro').delete]).toEqual([true, undefined, true]);
    });
  });

  it('passes rewriteSources to the vite plugin', () => {
    const customRewrite = (source: string) => source.replace(/^src\//, '');
    makeAddSentryVitePlugin({
      org: 'my-org',
      authToken: 'my-token',
      sourcemaps: {
        rewriteSources: customRewrite,
      },
    });

    expect(sentryVitePluginSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        sourcemaps: expect.objectContaining({
          rewriteSources: customRewrite,
        }),
      }),
    );
  });

  it('rewrites sources with the TanStack Start hook by default', () => {
    makeAddSentryVitePlugin({});

    expect(sentryVitePluginSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        sourcemaps: expect.objectContaining({ rewriteSources: rewriteTanstackStartSource }),
      }),
    );
  });

  it('sets the correct metaFramework in telemetry options', () => {
    makeAddSentryVitePlugin({
      org: 'my-org',
      authToken: 'my-token',
    });

    expect(sentryVitePluginSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        _metaOptions: {
          telemetry: {
            metaFramework: 'tanstackstart-react',
          },
        },
      }),
    );
  });

  it('passes reactComponentAnnotation options to the vite plugin', () => {
    makeAddSentryVitePlugin({
      reactComponentAnnotation: {
        enabled: true,
        ignoredComponents: ['MyIgnoredComponent'],
      },
    });

    expect(sentryVitePluginSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        reactComponentAnnotation: {
          enabled: true,
          ignoredComponents: ['MyIgnoredComponent'],
        },
      }),
    );
  });

  it('passes undefined reactComponentAnnotation values when not configured', () => {
    makeAddSentryVitePlugin({});

    expect(sentryVitePluginSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        reactComponentAnnotation: {
          enabled: undefined,
          ignoredComponents: undefined,
        },
      }),
    );
  });
});

describe('getUpdatedSourceMapSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('should keep sourcemap as false and emit warning when explicitly disabled', () => {
    const result = getUpdatedSourceMapSettings({ build: { sourcemap: false } });

    expect(result).toBe(false);
    // eslint-disable-next-line no-console
    expect(console.warn).toHaveBeenCalled();
  });

  it.each([
    ['hidden', 'hidden'],
    ['inline', 'inline'],
    [true, true],
  ] as const)('should keep sourcemap as %s when explicitly set', (input, expected) => {
    const result = getUpdatedSourceMapSettings({ build: { sourcemap: input } });

    expect(result).toBe(expected);
  });

  it.each([true, false, 'hidden'] as const)(
    'should keep `build.sourcemap` unset when `build.rolldownOptions.output.sourcemap` is %s',
    sourcemap => {
      const result = getUpdatedSourceMapSettings(
        { build: { rolldownOptions: { output: { sourcemap } } } },
        { debug: true },
      );

      expect(result).toBeUndefined();
      // eslint-disable-next-line no-console
      expect(console.log).toHaveBeenCalledWith(
        '[Sentry] We discovered `vite.build.rolldownOptions.output.sourcemap`, which overrides `vite.build.sourcemap`. Sentry will keep this source map setting.',
      );
    },
  );

  it('should set sourcemap to hidden when not configured', () => {
    const result = getUpdatedSourceMapSettings({});

    expect(result).toBe('hidden');
  });
});

describe('rewriteTanstackStartSource', () => {
  const projectRoot = path.resolve('/projects/shop');

  beforeEach(() => {
    vi.spyOn(process, 'cwd').mockReturnValue(projectRoot);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    {
      label: 'a server function split from a route',
      source: '../../../src/routes/index.tsx?tss-serverfn-split',
      mapDir: '.output/server/_ssr',
      expected: 'src/routes/index.tsx',
    },
    {
      label: 'a route component split for the client',
      source: '../../../src/routes/users.$userId.tsx?tsr-split=component',
      mapDir: '.output/public/assets',
      expected: 'src/routes/users.$userId.tsx',
    },
    {
      label: 'a dependency',
      source: '../../node_modules/.pnpm/h3@2.0.2/node_modules/h3/dist/index.mjs',
      mapDir: '.output/server',
      expected: 'node_modules/.pnpm/h3@2.0.2/node_modules/h3/dist/index.mjs',
    },
    {
      label: 'a source that climbs fewer directories than the map is deep',
      source: '../shared/format-price.ts',
      mapDir: '.output/server/chunks/build',
      expected: '.output/server/chunks/shared/format-price.ts',
    },
  ])('makes the path of $label relative to the project root', ({ source, mapDir, expected }) => {
    expect(rewriteTanstackStartSource(source, {}, { mapDir: path.join(projectRoot, mapDir) })).toBe(expected);
  });

  it('keeps sources that are no file paths', () => {
    const mapDir = path.join(projectRoot, '.output/server');

    expect(rewriteTanstackStartSource('virtual:#nitro/virtual/plugins', {}, { mapDir })).toBe(
      'virtual:#nitro/virtual/plugins',
    );
  });

  it('resolves sources from the project root without a map directory', () => {
    expect(rewriteTanstackStartSource('src/routes/index.tsx?tss-serverfn-split', {})).toBe('src/routes/index.tsx');
  });
});
