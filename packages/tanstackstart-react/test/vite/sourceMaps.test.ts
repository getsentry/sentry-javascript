// @vitest-environment node
import type { SentryVitePluginOptions } from '@sentry/bundler-plugins/vite';
import type { Plugin, ResolvedConfig, UserConfig } from 'vite';
import { mergeConfig } from 'vite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as path from 'path';
import {
  getUpdatedSourceMapSettings,
  makeAddSentryVitePlugin,
  makeEnableSourceMapsVitePlugin,
  rewriteTanstackStartSource,
} from '../../src/vite/sourceMaps';
import type { SentryTanstackStartOptions } from '../../src/vite/sentryTanstackStart';

const mockedSentryVitePlugin = {
  name: 'sentry-vite-debug-id-upload-plugin',
  writeBundle: vi.fn(),
};

let sentryVitePluginOptions: SentryVitePluginOptions | undefined;

const sentryVitePluginSpy = vi.fn((options: SentryVitePluginOptions) => {
  sentryVitePluginOptions = options;
  return [mockedSentryVitePlugin];
});

vi.mock('@sentry/bundler-plugins/vite', () => ({
  sentryVitePlugin: (options: SentryVitePluginOptions) => sentryVitePluginSpy(options),
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
    { label: 'the user set no source maps', userConfig: {}, expected: { client: true, ssr: true } },
    {
      label: 'the user set `build.sourcemap`',
      userConfig: { build: { sourcemap: true } },
      expected: { client: false, ssr: false },
    },
    {
      label: 'the user set the source maps of an environment',
      userConfig: { environments: { client: { build: { sourcemap: true } } } },
      expected: { client: false, ssr: true },
    },
    {
      label: 'the user set `build.rolldownOptions.output.sourcemap`',
      userConfig: { build: { rolldownOptions: { output: { sourcemap: true } } } },
      expected: { client: false, ssr: false },
    },
  ] as const)(
    'tells which environments only have source maps because of Sentry when $label',
    ({ userConfig, expected }) => {
      const plugin = makeEnableSourceMapsVitePlugin({})[0]!;
      (plugin.config as (config: UserConfig) => UserConfig)(structuredClone(userConfig) as UserConfig);

      expect({
        client: plugin.api.hasSentryEnabledSourceMaps('client'),
        ssr: plugin.api.hasSentryEnabledSourceMaps('ssr'),
      }).toEqual(expected);
    },
  );

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
  it('passes user-specified vite plugin options to vite plugin', async () => {
    const errorHandler = vi.fn();
    const plugins = makeAddSentryVitePlugin({
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

    // The filesToDeleteAfterUpload is now a Promise that resolves when the config hook runs
    expect(sentryVitePluginOptions?.sourcemaps?.filesToDeleteAfterUpload).toBeInstanceOf(Promise);

    // Trigger the configResolved hook to resolve the Promise
    const configPlugin = plugins.find(p => p.name === 'sentry-tanstackstart-files-to-delete-after-upload-plugin');
    (configPlugin?.configResolved as (config: ResolvedConfig) => void)({} as ResolvedConfig);

    // Verify the Promise resolves to the user-specified value
    const resolvedFilesToDelete = await sentryVitePluginOptions?.sourcemaps?.filesToDeleteAfterUpload;
    expect(resolvedFilesToDelete).toEqual(['baz/*.js']);

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

  it('returns Sentry Vite plugins and config plugin', () => {
    const plugins = makeAddSentryVitePlugin({
      org: 'my-org',
      authToken: 'my-token',
    });

    expect(plugins.length).toBeGreaterThanOrEqual(2);

    const configPlugin = plugins.find(p => p.name === 'sentry-tanstackstart-files-to-delete-after-upload-plugin');
    expect(configPlugin).toBeDefined();
    expect(configPlugin?.apply).toBe('build');
    expect(configPlugin?.enforce).toBe('post');
    expect(typeof configPlugin?.configResolved).toBe('function');
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

  describe('default filesToDeleteAfterUpload', () => {
    type TestEnvironment = {
      consumer: 'client' | 'server';
      outDir: string;
      outputDir?: string;
      outputSourceMap?: boolean;
    };

    const NITRO_ENVIRONMENTS: Record<string, TestEnvironment> = {
      client: { consumer: 'client', outDir: '.output/public' },
      ssr: { consumer: 'server', outDir: 'node_modules/.nitro/vite/services/ssr' },
      // Nitro sets the output directory of its server build with `output.dir` only.
      nitro: { consumer: 'server', outDir: 'dist', outputDir: '.output/server' },
    };

    /** A plugin that enabled the source maps of the given environments, like the Sentry plugins that enable them. */
    function sourceMapsEnabler(environmentNames: string[]): Plugin {
      return {
        name: 'source-maps-enabler',
        api: { hasSentryEnabledSourceMaps: (environmentName: string) => environmentNames.includes(environmentName) },
      };
    }

    function resolveFilesToDelete(
      environments: Record<string, TestEnvironment>,
      {
        sentryEnabledEnvironments = Object.keys(environments),
        options = {},
        viteVersion = '8.3.1',
      }: { sentryEnabledEnvironments?: string[]; options?: SentryTanstackStartOptions; viteVersion?: string } = {},
    ): Promise<unknown> {
      const isVite7 = viteVersion.startsWith('7.');
      const plugins = makeAddSentryVitePlugin(options);
      const config = {
        root: process.cwd(),
        plugins: [...plugins, sourceMapsEnabler(sentryEnabledEnvironments)],
        environments: Object.fromEntries(
          Object.entries(environments).map(([name, { consumer, outDir, outputDir, outputSourceMap }]) => [
            name,
            {
              consumer,
              build: {
                outDir,
                ...(!isVite7 && { rolldownOptions: { output: { dir: outputDir, sourcemap: outputSourceMap } } }),
              },
            },
          ]),
        ),
      } as unknown as ResolvedConfig;

      const configPlugin = plugins.find(p => p.name === 'sentry-tanstackstart-files-to-delete-after-upload-plugin');
      (configPlugin?.configResolved as (this: unknown, config: ResolvedConfig) => void).call(
        { meta: { viteVersion } },
        config,
      );

      return Promise.resolve(sentryVitePluginOptions?.sourcemaps?.filesToDeleteAfterUpload);
    }

    it.each([
      {
        label: 'a Nitro build, but not in the Nitro service output',
        environments: NITRO_ENVIRONMENTS,
        expected: ['.output/public/**/*.map', '.output/server/**/*.map'],
      },
      {
        label: 'a build without Nitro',
        environments: {
          client: { consumer: 'client', outDir: 'dist/client' },
          ssr: { consumer: 'server', outDir: 'dist/server' },
        },
        expected: ['dist/client/**/*.map', 'dist/server/**/*.map'],
      },
      {
        label: 'environments that share an output directory once',
        environments: {
          client: { consumer: 'client', outDir: 'dist' },
          ssr: { consumer: 'server', outDir: 'dist' },
        },
        expected: ['dist/**/*.map'],
      },
    ] as const)('deletes the source maps in each output directory of $label', async ({ environments, expected }) => {
      await expect(resolveFilesToDelete(environments)).resolves.toEqual(expected);
    });

    it.each([
      { label: 'the client', sentryEnabledEnvironments: ['nitro'], expected: ['.output/server/**/*.map'] },
      { label: 'the Nitro server', sentryEnabledEnvironments: ['client'], expected: ['.output/public/**/*.map'] },
      { label: 'any environment', sentryEnabledEnvironments: [], expected: [] },
    ])(
      'keeps the source maps of $label when Sentry did not enable them',
      async ({ sentryEnabledEnvironments, expected }) => {
        await expect(resolveFilesToDelete(NITRO_ENVIRONMENTS, { sentryEnabledEnvironments })).resolves.toEqual(
          expected,
        );
      },
    );

    it.each([true, false])(
      'keeps the source maps of an environment that sets `output.sourcemap: %s`',
      async outputSourceMap => {
        const environments = {
          ...NITRO_ENVIRONMENTS,
          client: { ...NITRO_ENVIRONMENTS.client!, outputSourceMap },
        };

        await expect(resolveFilesToDelete(environments)).resolves.toEqual(['.output/server/**/*.map']);
      },
    );

    it('warns and deletes the source maps in `build.outDir` with Vite 7', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const environments = {
        client: { consumer: 'client', outDir: 'dist/client' },
        ssr: { consumer: 'server', outDir: 'dist/server' },
      } as const;

      await expect(resolveFilesToDelete(environments, { viteVersion: '7.3.2' })).resolves.toEqual([
        'dist/client/**/*.map',
        'dist/server/**/*.map',
      ]);
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('TanStack Start requires Vite 8 or later.'));
      consoleWarnSpy.mockRestore();
    });

    it('does not warn with Vite 8', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await resolveFilesToDelete(NITRO_ENVIRONMENTS);

      expect(consoleWarnSpy).not.toHaveBeenCalled();
      consoleWarnSpy.mockRestore();
    });

    it('logs the default in debug mode', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await resolveFilesToDelete(NITRO_ENVIRONMENTS, { options: { debug: true } });

      expect(consoleSpy).toHaveBeenCalledWith(
        '[Sentry] Automatically setting `sourcemaps.filesToDeleteAfterUpload: [".output/public/**/*.map",".output/server/**/*.map"]` to delete generated source maps after they were uploaded to Sentry.',
      );
      consoleSpy.mockRestore();
    });

    it('logs that it deletes no source maps when Sentry enabled none', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await resolveFilesToDelete(NITRO_ENVIRONMENTS, { sentryEnabledEnvironments: [], options: { debug: true } });

      expect(consoleSpy).toHaveBeenCalledWith(
        '[Sentry] No source maps are deleted after the upload, because Sentry did not enable source map generation for this build.',
      );
      consoleSpy.mockRestore();
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
