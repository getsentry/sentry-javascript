import type { Nuxt } from '@nuxt/schema';
import type { Plugin, UserConfig } from 'vite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SourceMapSetting } from '../../src/vite/sourceMaps';

function createMockAddVitePlugin() {
  let capturedPlugin: Plugin | null = null;

  const mockAddVitePlugin = vi.fn((plugin: Plugin | (() => Plugin)) => {
    capturedPlugin = typeof plugin === 'function' ? plugin() : plugin;
  });

  return {
    mockAddVitePlugin,
    getCapturedPlugin: () => capturedPlugin,
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
  const mockSentryVitePlugin = vi.fn(() => ({ name: 'sentry-vite-plugin' }));
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
    it('registers a vite plugin after modules:done hook', async () => {
      const { setupSourceMaps } = await import('../../src/vite/sourceMaps');
      const mockNuxt = createMockNuxt({ _prepare: false, dev: false });
      const { mockAddVitePlugin, getCapturedPlugin } = createMockAddVitePlugin();

      setupSourceMaps({ debug: true }, mockNuxt as unknown as Nuxt, mockAddVitePlugin);
      await mockNuxt.triggerHook('modules:done');

      const plugin = getCapturedPlugin();
      expect(plugin).not.toBeNull();
      expect(plugin?.name).toBe('sentry-nuxt-vite-config');
    });

    it.each([
      {
        label: 'prepare mode',
        nuxtOptions: { _prepare: true },
        viteOptions: { mode: 'production', command: 'build' as const },
        buildConfig: { build: {}, plugins: [] },
      },
      {
        label: 'dev mode',
        nuxtOptions: { dev: true },
        viteOptions: { mode: 'development', command: 'build' as const },
        buildConfig: { build: {}, plugins: [] },
      },
    ])('does not add plugins to vite config in $label', async ({ nuxtOptions, viteOptions, buildConfig }) => {
      const { setupSourceMaps } = await import('../../src/vite/sourceMaps');
      const mockNuxt = createMockNuxt(nuxtOptions);
      const { mockAddVitePlugin, getCapturedPlugin } = createMockAddVitePlugin();

      setupSourceMaps({ debug: true }, mockNuxt as unknown as Nuxt, mockAddVitePlugin);
      await mockNuxt.triggerHook('modules:done');

      const plugin = getCapturedPlugin();
      expect(plugin).not.toBeNull();

      if (plugin && typeof plugin.config === 'function') {
        const viteConfig: UserConfig = buildConfig;
        plugin.config(viteConfig, viteOptions);
        expect(viteConfig.plugins?.length).toBe(0);
      }
    });

    it.each([
      { label: 'server (SSR) build', buildConfig: { build: { ssr: true }, plugins: [] } },
      { label: 'client build', buildConfig: { build: { ssr: false }, plugins: [] } },
    ])('adds sentry vite plugin to vite config for $label in production', async ({ buildConfig }) => {
      const { setupSourceMaps } = await import('../../src/vite/sourceMaps');
      const mockNuxt = createMockNuxt({ _prepare: false, dev: false });
      const { mockAddVitePlugin, getCapturedPlugin } = createMockAddVitePlugin();

      setupSourceMaps({ debug: true }, mockNuxt as unknown as Nuxt, mockAddVitePlugin);
      await mockNuxt.triggerHook('modules:done');

      const plugin = getCapturedPlugin();
      expect(plugin).not.toBeNull();

      if (plugin && typeof plugin.config === 'function') {
        const viteConfig: UserConfig = buildConfig;
        plugin.config(viteConfig, { mode: 'production', command: 'build' });
        expect(viteConfig.plugins?.length).toBeGreaterThan(0);
      }
    });
  });

  describe('sentry vite plugin calls', () => {
    it('calls sentryVitePlugin in production mode', async () => {
      const { setupSourceMaps } = await import('../../src/vite/sourceMaps');
      const mockNuxt = createMockNuxt({ _prepare: false, dev: false });
      const { mockAddVitePlugin, getCapturedPlugin } = createMockAddVitePlugin();

      setupSourceMaps({ debug: true }, mockNuxt as unknown as Nuxt, mockAddVitePlugin);
      await mockNuxt.triggerHook('modules:done');

      const plugin = getCapturedPlugin();
      if (plugin && typeof plugin.config === 'function') {
        plugin.config({ build: { ssr: false }, plugins: [] }, { mode: 'production', command: 'build' });
      }

      expect(mockSentryVitePlugin).toHaveBeenCalled();
    });

    it.each([
      { label: 'prepare mode', nuxtOptions: { _prepare: true }, viteMode: 'production' as const },
      { label: 'dev mode', nuxtOptions: { dev: true }, viteMode: 'development' as const },
    ])('does not call sentryVitePlugin in $label', async ({ nuxtOptions, viteMode }) => {
      const { setupSourceMaps } = await import('../../src/vite/sourceMaps');
      const mockNuxt = createMockNuxt(nuxtOptions);
      const { mockAddVitePlugin, getCapturedPlugin } = createMockAddVitePlugin();

      setupSourceMaps({ debug: true }, mockNuxt as unknown as Nuxt, mockAddVitePlugin);
      await mockNuxt.triggerHook('modules:done');

      const plugin = getCapturedPlugin();
      if (plugin && typeof plugin.config === 'function') {
        plugin.config({ build: {}, plugins: [] }, { mode: viteMode, command: 'build' });
      }

      expect(mockSentryVitePlugin).not.toHaveBeenCalled();
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
        plugin.config({ build: { ssr: false }, plugins: [] }, { mode: 'production', command: 'build' });
      }

      const nitroConfig = { rollupConfig: { plugins: [] as unknown[], output: {} }, dev: false };
      await mockNuxt.triggerHook('nitro:config', nitroConfig);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Sentry] Adding Sentry Vite plugin to the client runtime.'),
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
        plugin.config({ build: {}, plugins: [] }, { mode: 'production', command: 'build' });
      }

      await mockNuxt.triggerHook('nitro:config', { rollupConfig: { plugins: [] }, dev: false });

      expect(consoleLogSpy).not.toHaveBeenCalledWith(expect.stringContaining('[Sentry]'));
    });
  });
});
