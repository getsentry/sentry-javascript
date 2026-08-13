import type { Nuxt } from '@nuxt/schema';
import type { Plugin, UserConfig } from 'vite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SourceMapSetting } from '../../src/vite/sourceMaps';

function createMockAddVitePlugin() {
  let capturedPlugins: Plugin[] | null = null;

  const mockAddVitePlugin = vi.fn((plugins: Plugin[]) => {
    capturedPlugins = plugins;
  });

  return {
    mockAddVitePlugin,
    getCapturedPlugin: () => capturedPlugins?.[0] ?? null,
    getCapturedPlugins: () => capturedPlugins,
  };
}

type HookCallback = (...args: unknown[]) => void | Promise<void>;

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
  const defaultFilesToDeleteAfterUpload = [
    '.*/**/public/**/*.map',
    '.*/**/server/**/*.map',
    '.*/**/output/**/*.map',
    '.*/**/function/**/*.map',
  ];

  const mockSentryVitePlugin = vi.fn(() => [{ name: 'sentry-vite-plugin' }]);
  const mockSentryRollupPlugin = vi.fn(() => ({ name: 'sentry-rollup-plugin' }));
  const mockDeleteArtifacts = vi.fn().mockResolvedValue(undefined);
  const mockCreateSentryBuildPluginManager = vi.fn(() => ({ deleteArtifacts: mockDeleteArtifacts }));

  const consoleLogSpy = vi.spyOn(console, 'log');
  const consoleWarnSpy = vi.spyOn(console, 'warn');

  beforeAll(() => {
    vi.doMock('@sentry/bundler-plugins/core', () => ({
      createSentryBuildPluginManager: mockCreateSentryBuildPluginManager,
    }));
    vi.doMock('@sentry/bundler-plugins/vite', () => ({
      sentryVitePlugin: mockSentryVitePlugin,
    }));
    vi.doMock('@sentry/bundler-plugins/rollup', () => ({
      sentryRollupPlugin: mockSentryRollupPlugin,
    }));
  });

  afterAll(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    vi.doUnmock('@sentry/bundler-plugins/core');
    vi.doUnmock('@sentry/bundler-plugins/vite');
    vi.doUnmock('@sentry/bundler-plugins/rollup');
  });

  beforeEach(() => {
    consoleLogSpy.mockClear();
    consoleWarnSpy.mockClear();
    mockSentryVitePlugin.mockClear();
    mockSentryRollupPlugin.mockClear();
    mockCreateSentryBuildPluginManager.mockClear();
    mockDeleteArtifacts.mockClear();
  });

  describe('vite plugin registration', () => {
    it('calls `addVitePlugin` when setupSourceMaps is called', async () => {
      const { setupSourceMaps } = await import('../../src/vite/sourceMaps');
      const mockNuxt = createMockNuxt({ _prepare: false, dev: false });
      const { mockAddVitePlugin, getCapturedPlugin } = createMockAddVitePlugin();

      setupSourceMaps({ debug: true }, mockNuxt as unknown as Nuxt, mockAddVitePlugin);

      const plugin = getCapturedPlugin();
      expect(plugin).not.toBeNull();
      expect(plugin?.name).toBe('sentry-nuxt-source-map-validation');
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
      const { setupSourceMaps } = await import('../../src/vite/sourceMaps');
      const mockNuxt = createMockNuxt(nuxtOptions);
      const { mockAddVitePlugin } = createMockAddVitePlugin();

      setupSourceMaps({ debug: true }, mockNuxt as unknown as Nuxt, mockAddVitePlugin);
      await mockNuxt.triggerHook('modules:done');

      expect(mockAddVitePlugin).not.toHaveBeenCalled();
    });

    it('does not add plugins when source maps are disabled via `sourcemaps.disable`', async () => {
      const { setupSourceMaps } = await import('../../src/vite/sourceMaps');
      const mockNuxt = createMockNuxt({});
      const { mockAddVitePlugin } = createMockAddVitePlugin();

      setupSourceMaps({ sourcemaps: { disable: true } }, mockNuxt as unknown as Nuxt, mockAddVitePlugin);
      await mockNuxt.triggerHook('modules:done');

      expect(mockAddVitePlugin).not.toHaveBeenCalled();
    });

    it.each([
      { label: 'server (SSR) build', buildConfig: { build: { ssr: true }, plugins: [] } },
      { label: 'client build', buildConfig: { build: { ssr: false }, plugins: [] } },
    ])('adds sentry vite plugin to vite config for $label in production', async () => {
      const { setupSourceMaps } = await import('../../src/vite/sourceMaps');
      const mockNuxt = createMockNuxt({ _prepare: false, dev: false });
      const { mockAddVitePlugin, getCapturedPlugins } = createMockAddVitePlugin();

      setupSourceMaps({ debug: true }, mockNuxt as unknown as Nuxt, mockAddVitePlugin);

      const plugins = getCapturedPlugins();
      expect(plugins).not.toBeNull();
      expect(plugins?.length).toBeGreaterThan(0);
      expect(mockSentryVitePlugin).toHaveBeenCalled();
    });
  });

  describe('sentry vite plugin calls', () => {
    it('calls sentryVitePlugin in production mode', async () => {
      const { setupSourceMaps } = await import('../../src/vite/sourceMaps');
      const mockNuxt = createMockNuxt({ _prepare: false, dev: false });
      const { mockAddVitePlugin } = createMockAddVitePlugin();

      setupSourceMaps({ debug: true }, mockNuxt as unknown as Nuxt, mockAddVitePlugin);

      expect(mockSentryVitePlugin).toHaveBeenCalled();
    });

    it.each([
      { label: 'prepare mode', nuxtOptions: { _prepare: true }, viteMode: 'production' as const },
      { label: 'dev mode', nuxtOptions: { dev: true }, viteMode: 'development' as const },
    ])('does not call sentryVitePlugin in $label', async ({ nuxtOptions }) => {
      const { setupSourceMaps } = await import('../../src/vite/sourceMaps');
      const mockNuxt = createMockNuxt(nuxtOptions);
      const { mockAddVitePlugin } = createMockAddVitePlugin();

      setupSourceMaps({ debug: true }, mockNuxt as unknown as Nuxt, mockAddVitePlugin);

      expect(mockSentryVitePlugin).not.toHaveBeenCalled();
    });
  });

  describe('shouldDeleteFilesFallback passed to getPluginOptions in Vite plugin', () => {
    it('does not pass fallback deletion patterns to the Vite plugin', async () => {
      const { setupSourceMaps } = await import('../../src/vite/sourceMaps');
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
      const { setupSourceMaps } = await import('../../src/vite/sourceMaps');
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
      const { setupSourceMaps } = await import('../../src/vite/sourceMaps');
      const mockNuxt = createMockNuxt({
        _prepare: false,
        dev: false,
        sourcemap: { client: undefined, server: undefined },
      });
      const { mockAddVitePlugin } = createMockAddVitePlugin();

      setupSourceMaps({ debug: false }, mockNuxt as unknown as Nuxt, mockAddVitePlugin);
      await mockNuxt.triggerHook('modules:done');
      await mockNuxt.triggerHook('close');

      expect(mockCreateSentryBuildPluginManager).toHaveBeenCalledWith(
        expect.objectContaining({
          sourcemaps: expect.objectContaining({ filesToDeleteAfterUpload: defaultFilesToDeleteAfterUpload }),
        }),
        { buildTool: 'nuxt', loggerPrefix: '[Sentry Nuxt]' },
      );
      expect(mockDeleteArtifacts).toHaveBeenCalledTimes(1);
    });

    it('uses user-provided deletion patterns after the build', async () => {
      const { setupSourceMaps } = await import('../../src/vite/sourceMaps');
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
      const { setupSourceMaps } = await import('../../src/vite/sourceMaps');
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
      const { setupSourceMaps } = await import('../../src/vite/sourceMaps');
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
      const { setupSourceMaps } = await import('../../src/vite/sourceMaps');
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
      const { setupSourceMaps } = await import('../../src/vite/sourceMaps');
      const mockNuxt = createMockNuxt(nuxtOptions);
      const { mockAddVitePlugin } = createMockAddVitePlugin();

      setupSourceMaps({ debug: true }, mockNuxt as unknown as Nuxt, mockAddVitePlugin);
      await mockNuxt.triggerHook('modules:done');
      await mockNuxt.triggerHook('nitro:config', nitroConfig);

      expect(mockSentryRollupPlugin).not.toHaveBeenCalled();
    });
  });

  describe('debug logging', () => {
    it('logs a [Sentry] message in production mode', async () => {
      const { setupSourceMaps } = await import('../../src/vite/sourceMaps');
      const mockNuxt = createMockNuxt({ _prepare: false, dev: false });
      const { mockAddVitePlugin, getCapturedPlugin } = createMockAddVitePlugin();

      setupSourceMaps({ debug: true }, mockNuxt as unknown as Nuxt, mockAddVitePlugin);
      await mockNuxt.triggerHook('modules:done');

      const plugin = getCapturedPlugin();
      if (plugin && typeof plugin.config === 'function') {
        plugin.config({ build: { ssr: false }, plugins: [] } as UserConfig, { mode: 'production', command: 'build' });
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
      const { setupSourceMaps } = await import('../../src/vite/sourceMaps');
      const mockNuxt = createMockNuxt({ _prepare: true });
      const { mockAddVitePlugin, getCapturedPlugin } = createMockAddVitePlugin();

      setupSourceMaps({ debug: true }, mockNuxt as unknown as Nuxt, mockAddVitePlugin);
      await mockNuxt.triggerHook('modules:done');

      const plugin = getCapturedPlugin();
      if (plugin && typeof plugin.config === 'function') {
        plugin.config({ build: {}, plugins: [] } as UserConfig, { mode: 'production', command: 'build' });
      }

      await mockNuxt.triggerHook('nitro:config', { rollupConfig: { plugins: [] }, dev: false });

      expect(consoleLogSpy).not.toHaveBeenCalledWith(expect.stringContaining('[Sentry]'));
    });
  });
});
