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
  const mockSentryVitePlugin = vi.fn(() => [{ name: 'sentry-vite-plugin' }]);
  const mockSentryRollupPlugin = vi.fn(() => ({ name: 'sentry-rollup-plugin' }));

  const consoleLogSpy = vi.spyOn(console, 'log');
  const consoleWarnSpy = vi.spyOn(console, 'warn');

  beforeAll(() => {
    vi.doMock('@sentry/vite-plugin', () => ({
      sentryVitePlugin: mockSentryVitePlugin,
    }));
    vi.doMock('@sentry/rollup-plugin', () => ({
      sentryRollupPlugin: mockSentryRollupPlugin,
    }));
  });

  afterAll(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    vi.doUnmock('@sentry/vite-plugin');
    vi.doUnmock('@sentry/rollup-plugin');
  });

  beforeEach(() => {
    consoleLogSpy.mockClear();
    consoleWarnSpy.mockClear();
    mockSentryVitePlugin.mockClear();
    mockSentryRollupPlugin.mockClear();
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

    it.each([
      { label: 'server (SSR) build', buildConfig: { build: { ssr: true }, plugins: [] } },
      { label: 'client build', buildConfig: { build: { ssr: false }, plugins: [] } },
    ])('adds sentry vite plugin to vite config for $label in production', async ({ buildConfig }) => {
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
    const defaultFilesToDeleteAfterUpload = [
      '.*/**/public/**/*.map',
      '.*/**/server/**/*.map',
      '.*/**/output/**/*.map',
      '.*/**/function/**/*.map',
    ];

    it('sentryVitePlugin is called with fallback filesToDeleteAfterUpload when source maps are unset', async () => {
      const { setupSourceMaps } = await import('../../src/vite/sourceMaps');
      const mockNuxt = createMockNuxt({
        _prepare: false,
        dev: false,
        sourcemap: { client: undefined, server: undefined },
      });
      const { mockAddVitePlugin } = createMockAddVitePlugin();

      setupSourceMaps({ debug: false }, mockNuxt as unknown as Nuxt, mockAddVitePlugin);

      expect(mockSentryVitePlugin).toHaveBeenCalledWith(
        expect.objectContaining({
          sourcemaps: expect.objectContaining({
            filesToDeleteAfterUpload: defaultFilesToDeleteAfterUpload,
          }),
        }),
      );
    });

    it('sentryVitePlugin is called with fallback filesToDeleteAfterUpload even when source maps are explicitly enabled', async () => {
      const { setupSourceMaps } = await import('../../src/vite/sourceMaps');
      const mockNuxt = createMockNuxt({
        _prepare: false,
        dev: false,
        sourcemap: { client: true, server: true },
      });
      const { mockAddVitePlugin } = createMockAddVitePlugin();

      setupSourceMaps({ debug: false }, mockNuxt as unknown as Nuxt, mockAddVitePlugin);

      expect(mockSentryVitePlugin).toHaveBeenCalledWith(
        expect.objectContaining({
          sourcemaps: expect.objectContaining({
            filesToDeleteAfterUpload: defaultFilesToDeleteAfterUpload,
          }),
        }),
      );
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
