import type { Nuxt } from '@nuxt/schema';
import type * as BundlerPluginsCore from '@sentry/bundler-plugins/core';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { ConfigEnv, Plugin, UserConfig } from 'vite';
import { afterAll, afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { setupSourceMaps, type SourceMapSetting } from '../../src/vite/sourceMaps';

const { mockSentryVitePlugin, mockSentryRollupPlugin, mockDeleteArtifacts, mockCreateSentryBuildPluginManager } =
  vi.hoisted(() => {
    const deleteArtifacts = vi.fn().mockResolvedValue(undefined);

    return {
      mockSentryVitePlugin: vi.fn(() => [{ name: 'sentry-vite-plugin' }]),
      mockSentryRollupPlugin: vi.fn(() => ({ name: 'sentry-rollup-plugin' })),
      mockDeleteArtifacts: deleteArtifacts,
      mockCreateSentryBuildPluginManager: vi.fn(() => ({ deleteArtifacts })),
    };
  });

vi.mock('@sentry/bundler-plugins/core', async importOriginal => ({
  ...(await importOriginal<typeof BundlerPluginsCore>()),
  createSentryBuildPluginManager: mockCreateSentryBuildPluginManager,
}));
vi.mock('@sentry/bundler-plugins/vite', () => ({ sentryVitePlugin: mockSentryVitePlugin }));
vi.mock('@sentry/bundler-plugins/rollup', () => ({ sentryRollupPlugin: mockSentryRollupPlugin }));

function createMockAddVitePlugin() {
  const capturedPlugins: Plugin[] = [];

  const mockAddVitePlugin = vi.fn((plugins: Plugin[]) => {
    capturedPlugins.push(...plugins);
  });

  return {
    mockAddVitePlugin,
    getValidationPlugin: () =>
      capturedPlugins.find(plugin => plugin.name === 'sentry-nuxt-source-map-validation') ?? null,
  };
}

type HookCallback = (...args: unknown[]) => void | Promise<void>;

/** Nitro's output directories of the `node-server` preset, relative to the working directory. */
const NODE_SERVER_OUTPUT = { publicDir: '.output/public', serverDir: '.output/server' };

function createMockNitro(options: { dev?: boolean; output?: { publicDir: string; serverDir: string } } = {}) {
  const output = options.output ?? NODE_SERVER_OUTPUT;
  return {
    options: {
      dev: options.dev ?? false,
      output: {
        publicDir: path.join(process.cwd(), output.publicDir),
        serverDir: path.join(process.cwd(), output.serverDir),
      },
      rollupConfig: { plugins: [{ name: 'sentry-rollup-plugin' }] as unknown },
    },
  };
}

function createMockNuxt(options: {
  _prepare?: boolean;
  dev?: boolean;
  sourcemap?: SourceMapSetting | { server?: SourceMapSetting; client?: SourceMapSetting };
}) {
  const hooks: Record<string, HookCallback[]> = {};

  return {
    options: {
      _prepare: options._prepare ?? false,
      dev: options.dev ?? false,
      sourcemap: options.sourcemap ?? { server: undefined, client: undefined },
    },
    hook: (name: string, callback: HookCallback) => {
      hooks[name] = hooks[name] || [];
      hooks[name].push(callback);
    },
    // Helper to trigger hooks in tests
    triggerHook: async (name: string, ...args: unknown[]) => {
      const callbacks = hooks[name] || [];
      for (const callback of callbacks) {
        await callback(...args);
      }
    },
  };
}

describe('setupSourceMaps hooks', () => {
  const defaultFilesToDeleteAfterUpload = ['.output/public/**/*.map', '.output/server/**/*.map'];

  const consoleLogSpy = vi.spyOn(console, 'log');
  const consoleWarnSpy = vi.spyOn(console, 'warn');

  afterAll(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  beforeEach(() => {
    consoleLogSpy.mockClear();
    consoleWarnSpy.mockClear();
    mockSentryVitePlugin.mockClear();
    mockSentryRollupPlugin.mockClear();
    mockCreateSentryBuildPluginManager.mockClear();
    mockDeleteArtifacts.mockClear();
  });

  describe('removed `unstable_sentryBundlerPluginOptions`', () => {
    // `getPluginOptions` runs once per bundler (Vite and Nitro's Rollup), so warning there emitted
    // the same message twice. This pins it to exactly one.
    it('warns exactly once, even though both bundler plugins are set up', async () => {
      const mockNuxt = createMockNuxt({});
      const { mockAddVitePlugin } = createMockAddVitePlugin();

      setupSourceMaps(
        // @ts-expect-error - removed in v11, but JS configs get no type checking
        { unstable_sentryBundlerPluginOptions: { org: 'override-org' } },
        mockNuxt as unknown as Nuxt,
        mockAddVitePlugin,
      );
      await mockNuxt.triggerHook('nitro:config', { rollupConfig: {} });

      const removalWarnings = consoleWarnSpy.mock.calls.filter(([message]) =>
        String(message).includes('unstable_sentryBundlerPluginOptions'),
      );
      expect(removalWarnings).toHaveLength(1);
    });

    it('does not warn for a config without removed options', async () => {
      const mockNuxt = createMockNuxt({});
      const { mockAddVitePlugin } = createMockAddVitePlugin();

      setupSourceMaps({ org: 'my-org' }, mockNuxt as unknown as Nuxt, mockAddVitePlugin);

      expect(consoleWarnSpy).not.toHaveBeenCalledWith(expect.stringContaining('unstable_'));
    });
  });

  describe('vite plugin registration', () => {
    it('adds the source map validation plugin to the client and server builds', async () => {
      const mockNuxt = createMockNuxt({ _prepare: false, dev: false });
      const { mockAddVitePlugin } = createMockAddVitePlugin();

      setupSourceMaps({ debug: true }, mockNuxt as unknown as Nuxt, mockAddVitePlugin);

      expect(mockAddVitePlugin).toHaveBeenCalledWith(
        [expect.objectContaining({ name: 'sentry-nuxt-source-map-validation' })],
        { dev: false, build: true },
      );
    });

    it('adds the Sentry Vite plugin to the client build only', async () => {
      const mockNuxt = createMockNuxt({ _prepare: false, dev: false });
      const { mockAddVitePlugin } = createMockAddVitePlugin();

      setupSourceMaps({ debug: true }, mockNuxt as unknown as Nuxt, mockAddVitePlugin);

      expect(mockAddVitePlugin).toHaveBeenCalledTimes(2);
      expect(mockAddVitePlugin).toHaveBeenCalledWith([{ name: 'sentry-vite-plugin' }], {
        dev: false,
        build: true,
        server: false,
      });
    });

    it.each([
      {
        label: 'prepare mode',
        nuxtOptions: { _prepare: true },
      },
      {
        label: 'dev mode',
        nuxtOptions: { dev: true },
      },
    ])('does not add plugins to vite config in $label', async ({ nuxtOptions }) => {
      const mockNuxt = createMockNuxt(nuxtOptions);
      const { mockAddVitePlugin } = createMockAddVitePlugin();

      setupSourceMaps({ debug: true }, mockNuxt as unknown as Nuxt, mockAddVitePlugin);
      await mockNuxt.triggerHook('modules:done');

      expect(mockAddVitePlugin).not.toHaveBeenCalled();
    });

    it('does not add plugins when source maps are disabled via `sourcemaps.disable`', async () => {
      const mockNuxt = createMockNuxt({});
      const { mockAddVitePlugin } = createMockAddVitePlugin();

      setupSourceMaps({ sourcemaps: { disable: true } }, mockNuxt as unknown as Nuxt, mockAddVitePlugin);
      await mockNuxt.triggerHook('modules:done');

      expect(mockAddVitePlugin).not.toHaveBeenCalled();
    });
  });

  describe('sentry vite plugin calls', () => {
    it('calls sentryVitePlugin in production mode', async () => {
      const mockNuxt = createMockNuxt({ _prepare: false, dev: false });
      const { mockAddVitePlugin } = createMockAddVitePlugin();

      setupSourceMaps({ debug: true }, mockNuxt as unknown as Nuxt, mockAddVitePlugin);

      expect(mockSentryVitePlugin).toHaveBeenCalled();
    });

    it.each([
      { label: 'prepare mode', nuxtOptions: { _prepare: true }, viteMode: 'production' as const },
      { label: 'dev mode', nuxtOptions: { dev: true }, viteMode: 'development' as const },
    ])('does not call sentryVitePlugin in $label', async ({ nuxtOptions }) => {
      const mockNuxt = createMockNuxt(nuxtOptions);
      const { mockAddVitePlugin } = createMockAddVitePlugin();

      setupSourceMaps({ debug: true }, mockNuxt as unknown as Nuxt, mockAddVitePlugin);

      expect(mockSentryVitePlugin).not.toHaveBeenCalled();
    });
  });

  describe('shouldDeleteFilesFallback passed to getPluginOptions in Vite plugin', () => {
    it('does not pass fallback deletion patterns to the Vite plugin', async () => {
      const mockNuxt = createMockNuxt({
        _prepare: false,
        dev: false,
        sourcemap: { client: undefined, server: undefined },
      });
      const { mockAddVitePlugin } = createMockAddVitePlugin();

      setupSourceMaps({ debug: false }, mockNuxt as unknown as Nuxt, mockAddVitePlugin);

      expect(mockSentryVitePlugin).toHaveBeenCalledWith({
        applicationKey: undefined,
        org: undefined,
        project: undefined,
        authToken: undefined,
        telemetry: true,
        url: undefined,
        headers: undefined,
        debug: false,
        silent: false,
        errorHandler: undefined,
        bundleSizeOptimizations: undefined,
        release: { name: undefined },
        _metaOptions: { telemetry: { metaFramework: 'nuxt' } },
        sourcemaps: {
          disable: undefined,
          assets: undefined,
          ignore: undefined,
          filesToDeleteAfterUpload: undefined,
          rewriteSources: expect.any(Function),
        },
      });
    });

    it('sentryRollupPlugin is called without filesToDeleteAfterUpload when source maps are explicitly enabled', async () => {
      const mockNuxt = createMockNuxt({
        _prepare: false,
        dev: false,
        sourcemap: { client: true, server: true },
      });
      const { mockAddVitePlugin } = createMockAddVitePlugin();

      setupSourceMaps({ debug: false }, mockNuxt as unknown as Nuxt, mockAddVitePlugin);
      await mockNuxt.triggerHook('modules:done');

      const nitroConfig = { rollupConfig: { plugins: [] as unknown[], output: {} }, dev: false };
      await mockNuxt.triggerHook('nitro:config', nitroConfig);

      expect(mockSentryRollupPlugin).toHaveBeenCalledWith(
        expect.objectContaining({
          sourcemaps: expect.objectContaining({ filesToDeleteAfterUpload: undefined }),
        }),
      );
    });
  });

  describe('close hook', () => {
    it('deletes source maps after the build using fallback patterns', async () => {
      const mockNuxt = createMockNuxt({
        _prepare: false,
        dev: false,
        sourcemap: { client: undefined, server: undefined },
      });
      const { mockAddVitePlugin } = createMockAddVitePlugin();

      setupSourceMaps({ debug: false }, mockNuxt as unknown as Nuxt, mockAddVitePlugin);
      await mockNuxt.triggerHook('modules:done');
      await mockNuxt.triggerHook('nitro:init', createMockNitro());
      await mockNuxt.triggerHook('close');

      expect(mockCreateSentryBuildPluginManager).toHaveBeenCalledWith(
        expect.objectContaining({
          sourcemaps: expect.objectContaining({ filesToDeleteAfterUpload: defaultFilesToDeleteAfterUpload }),
        }),
        { buildTool: 'nuxt', loggerPrefix: '[Sentry Nuxt]' },
      );
      expect(mockDeleteArtifacts).toHaveBeenCalledTimes(1);
    });

    it('keeps the server source maps that `nitro.rollupConfig.output.sourcemap` enables', async () => {
      const mockNuxt = createMockNuxt({ sourcemap: { client: undefined, server: undefined } });
      const nitroConfig = { rollupConfig: { plugins: [] as unknown[], output: { sourcemap: true } }, dev: false };

      setupSourceMaps({}, mockNuxt as unknown as Nuxt, vi.fn());
      await mockNuxt.triggerHook('modules:done');
      await mockNuxt.triggerHook('nitro:config', nitroConfig);
      await mockNuxt.triggerHook('nitro:init', createMockNitro());
      await mockNuxt.triggerHook('close');

      expect(mockCreateSentryBuildPluginManager).toHaveBeenCalledWith(
        expect.objectContaining({
          sourcemaps: expect.objectContaining({ filesToDeleteAfterUpload: ['.output/public/**/*.map'] }),
        }),
        { buildTool: 'nuxt', loggerPrefix: '[Sentry Nuxt]' },
      );
    });

    it('uses user-provided deletion patterns after the build', async () => {
      const mockNuxt = createMockNuxt({
        _prepare: false,
        dev: false,
        sourcemap: { client: true, server: true },
      });
      const { mockAddVitePlugin } = createMockAddVitePlugin();
      const filesToDeleteAfterUpload = ['.output/**/*.map'];

      setupSourceMaps({ sourcemaps: { filesToDeleteAfterUpload } }, mockNuxt as unknown as Nuxt, mockAddVitePlugin);
      await mockNuxt.triggerHook('modules:done');
      await mockNuxt.triggerHook('close');

      expect(mockCreateSentryBuildPluginManager).toHaveBeenCalledWith(
        expect.objectContaining({
          sourcemaps: expect.objectContaining({ filesToDeleteAfterUpload }),
        }),
        { buildTool: 'nuxt', loggerPrefix: '[Sentry Nuxt]' },
      );
      expect(mockDeleteArtifacts).toHaveBeenCalledTimes(1);
    });

    it('does not create a manager when deletion is not configured', async () => {
      const mockNuxt = createMockNuxt({
        _prepare: false,
        dev: false,
        sourcemap: { client: true, server: true },
      });
      const { mockAddVitePlugin } = createMockAddVitePlugin();

      setupSourceMaps({}, mockNuxt as unknown as Nuxt, mockAddVitePlugin);
      await mockNuxt.triggerHook('modules:done');
      await mockNuxt.triggerHook('close');

      expect(mockCreateSentryBuildPluginManager).not.toHaveBeenCalled();
      expect(mockDeleteArtifacts).not.toHaveBeenCalled();
    });

    it.each([
      { label: 'prepare mode', nuxtOptions: { _prepare: true, dev: false } },
      { label: 'dev mode', nuxtOptions: { _prepare: false, dev: true } },
    ])('does not delete source maps in $label', async ({ nuxtOptions }) => {
      const mockNuxt = createMockNuxt(nuxtOptions);
      const { mockAddVitePlugin } = createMockAddVitePlugin();

      setupSourceMaps(
        { sourcemaps: { filesToDeleteAfterUpload: ['.output/**/*.map'] } },
        mockNuxt as unknown as Nuxt,
        mockAddVitePlugin,
      );
      await mockNuxt.triggerHook('close');

      expect(mockCreateSentryBuildPluginManager).not.toHaveBeenCalled();
    });
  });

  describe('nitro:config hook', () => {
    it('adds sentryRollupPlugin to nitro rollup config in production mode', async () => {
      const mockNuxt = createMockNuxt({ _prepare: false, dev: false });
      const { mockAddVitePlugin } = createMockAddVitePlugin();

      setupSourceMaps({ debug: true }, mockNuxt as unknown as Nuxt, mockAddVitePlugin);
      await mockNuxt.triggerHook('modules:done');

      const nitroConfig = { rollupConfig: { plugins: [] as unknown[], output: {} }, dev: false };
      await mockNuxt.triggerHook('nitro:config', nitroConfig);

      expect(mockSentryRollupPlugin).toHaveBeenCalled();
      expect(nitroConfig.rollupConfig.plugins.length).toBeGreaterThan(0);
    });

    it.each([
      {
        label: 'prepare mode',
        nuxtOptions: { _prepare: true },
        nitroConfig: { rollupConfig: { plugins: [] }, dev: false },
      },
      { label: 'dev mode', nuxtOptions: { dev: true }, nitroConfig: { rollupConfig: { plugins: [] }, dev: true } },
    ])('does not add sentryRollupPlugin to nitro rollup config in $label', async ({ nuxtOptions, nitroConfig }) => {
      const mockNuxt = createMockNuxt(nuxtOptions);
      const { mockAddVitePlugin } = createMockAddVitePlugin();

      setupSourceMaps({ debug: true }, mockNuxt as unknown as Nuxt, mockAddVitePlugin);
      await mockNuxt.triggerHook('modules:done');
      await mockNuxt.triggerHook('nitro:config', nitroConfig);

      expect(mockSentryRollupPlugin).not.toHaveBeenCalled();
    });
  });

  describe('nitro:init hook', () => {
    const PUBLIC_MAP = '.output/public/_nuxt/entry.DxB3kLmA.js.map';
    const PUBLIC_CHUNK = '.output/public/_nuxt/entry.DxB3kLmA.js';
    const SSR_BUILD_MAP = '.nuxt/dist/server/_nuxt/index-B2kR7mXp.mjs.map';

    let rootDir: string;
    let cwdSpy: MockInstance<typeof process.cwd>;

    beforeEach(() => {
      rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentry-nuxt-root-'));
      // The fallback deletion patterns are relative to the working directory.
      cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(rootDir);
      for (const file of [PUBLIC_MAP, PUBLIC_CHUNK, SSR_BUILD_MAP]) {
        fs.mkdirSync(path.dirname(path.join(rootDir, file)), { recursive: true });
        fs.writeFileSync(path.join(rootDir, file), '');
      }
    });

    afterEach(() => {
      cwdSpy.mockRestore();
      fs.rmSync(rootDir, { recursive: true, force: true });
    });

    function findDeletionPlugin(nitro: ReturnType<typeof createMockNitro>) {
      return [nitro.options.rollupConfig.plugins]
        .flat(2)
        .find(
          (plugin): plugin is { name: string; buildStart: () => Promise<void> } =>
            typeof plugin === 'object' &&
            plugin !== null &&
            'name' in plugin &&
            plugin.name === 'sentry-nuxt-public-source-map-deletion' &&
            'buildStart' in plugin &&
            typeof plugin.buildStart === 'function',
        );
    }

    function remainingFiles(): string[] {
      return [PUBLIC_MAP, PUBLIC_CHUNK, SSR_BUILD_MAP].filter(file => fs.existsSync(path.join(rootDir, file)));
    }

    it('deletes the source maps in the Nitro public dir when Nitro starts to bundle the server', async () => {
      const mockNuxt = createMockNuxt({ sourcemap: { client: 'hidden', server: true } });
      const nitro = createMockNitro();
      const filesToDeleteAfterUpload = [`${rootDir.split(path.sep).join('/')}/.output/public/**/*.map`];

      setupSourceMaps({ sourcemaps: { filesToDeleteAfterUpload } }, mockNuxt as unknown as Nuxt, vi.fn());
      await mockNuxt.triggerHook('modules:done');
      await mockNuxt.triggerHook('nitro:init', nitro);
      const deletionPlugin = findDeletionPlugin(nitro);
      await deletionPlugin?.buildStart();

      expect(deletionPlugin).toBeDefined();
      expect(remainingFiles()).toEqual([PUBLIC_CHUNK, SSR_BUILD_MAP]);
    });

    it('deletes only the public source maps with the fallback patterns and keeps the SSR build maps', async () => {
      const mockNuxt = createMockNuxt({ sourcemap: { client: undefined, server: undefined } });
      const nitro = createMockNitro();

      setupSourceMaps({}, mockNuxt as unknown as Nuxt, vi.fn());
      await mockNuxt.triggerHook('modules:done');
      await mockNuxt.triggerHook('nitro:init', nitro);
      const deletionPlugin = findDeletionPlugin(nitro);
      await deletionPlugin?.buildStart();

      expect(deletionPlugin).toBeDefined();
      expect(remainingFiles()).toEqual([PUBLIC_CHUNK, SSR_BUILD_MAP]);
    });

    it('deletes the public source maps of a preset that writes the public files outside of `.output`', async () => {
      const netlifyPublicMap = 'dist/_nuxt/entry.DxB3kLmA.js.map';
      fs.mkdirSync(path.dirname(path.join(rootDir, netlifyPublicMap)), { recursive: true });
      fs.writeFileSync(path.join(rootDir, netlifyPublicMap), '');
      const mockNuxt = createMockNuxt({ sourcemap: { client: undefined, server: true } });
      const nitro = createMockNitro({
        output: { publicDir: 'dist', serverDir: '.netlify/functions-internal/server' },
      });

      setupSourceMaps({}, mockNuxt as unknown as Nuxt, vi.fn());
      await mockNuxt.triggerHook('modules:done');
      await mockNuxt.triggerHook('nitro:init', nitro);
      await findDeletionPlugin(nitro)?.buildStart();

      expect(fs.existsSync(path.join(rootDir, netlifyPublicMap))).toBe(false);
    });

    it.each([
      { label: 'prepare mode', nuxtOptions: { _prepare: true }, nitroOptions: {} },
      { label: 'dev mode', nuxtOptions: { dev: true }, nitroOptions: { dev: true } },
    ])('does not add the deletion plugin in $label', async ({ nuxtOptions, nitroOptions }) => {
      const mockNuxt = createMockNuxt(nuxtOptions);
      const nitro = createMockNitro(nitroOptions);

      setupSourceMaps(
        { sourcemaps: { filesToDeleteAfterUpload: ['.output/**/*.map'] } },
        mockNuxt as unknown as Nuxt,
        vi.fn(),
      );
      await mockNuxt.triggerHook('nitro:init', nitro);

      expect(findDeletionPlugin(nitro)).toBeUndefined();
    });
  });

  describe('debug logging', () => {
    it('logs a [Sentry] message in production mode', async () => {
      const mockNuxt = createMockNuxt({ _prepare: false, dev: false });
      const { mockAddVitePlugin, getValidationPlugin } = createMockAddVitePlugin();

      setupSourceMaps({ debug: true }, mockNuxt as unknown as Nuxt, mockAddVitePlugin);
      await mockNuxt.triggerHook('modules:done');

      const plugin = getValidationPlugin();
      if (plugin && typeof plugin.config === 'function') {
        (plugin.config as (config: UserConfig, env: ConfigEnv) => void)(
          { build: { ssr: false }, plugins: [] } as UserConfig,
          { mode: 'production', command: 'build' },
        );
      }

      const nitroConfig = { rollupConfig: { plugins: [] as unknown[], output: {} }, dev: false };
      await mockNuxt.triggerHook('nitro:config', nitroConfig);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Sentry] Validating Vite config for the client runtime.'),
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Sentry] Adding Sentry Rollup plugin to the server runtime.'),
      );
    });

    it('does not log a [Sentry] messages in prepare mode', async () => {
      const mockNuxt = createMockNuxt({ _prepare: true });
      const { mockAddVitePlugin, getValidationPlugin } = createMockAddVitePlugin();

      setupSourceMaps({ debug: true }, mockNuxt as unknown as Nuxt, mockAddVitePlugin);
      await mockNuxt.triggerHook('modules:done');

      const plugin = getValidationPlugin();
      if (plugin && typeof plugin.config === 'function') {
        (plugin.config as (config: UserConfig, env: ConfigEnv) => void)({ build: {}, plugins: [] } as UserConfig, {
          mode: 'production',
          command: 'build',
        });
      }

      await mockNuxt.triggerHook('nitro:config', { rollupConfig: { plugins: [] }, dev: false });

      expect(consoleLogSpy).not.toHaveBeenCalledWith(expect.stringContaining('[Sentry]'));
    });
  });
});
