import type { Nuxt } from '@nuxt/schema';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SourceMapSetting } from '../../src/vite/sourceMaps';

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

  it('should not call any source map related functions in nuxt prepare mode', async () => {
    const { setupSourceMaps } = await import('../../src/vite/sourceMaps');
    const mockNuxt = createMockNuxt({ _prepare: true });

    setupSourceMaps({ debug: true }, mockNuxt as unknown as Nuxt);

    await mockNuxt.triggerHook('modules:done');
    await mockNuxt.triggerHook(
      'vite:extendConfig',
      { build: {}, plugins: [], mode: 'production' },
      { isServer: true, isClient: false },
    );
    await mockNuxt.triggerHook('nitro:config', { rollupConfig: { plugins: [] }, dev: false });

    expect(mockSentryVitePlugin).not.toHaveBeenCalled();
    expect(mockSentryRollupPlugin).not.toHaveBeenCalled();

    expect(consoleLogSpy).not.toHaveBeenCalledWith(expect.stringContaining('[Sentry]'));
  });

  it('should call source map related functions when not in prepare mode', async () => {
    const { setupSourceMaps } = await import('../../src/vite/sourceMaps');
    const mockNuxt = createMockNuxt({ _prepare: false, dev: false });

    setupSourceMaps({ debug: true }, mockNuxt as unknown as Nuxt);

    await mockNuxt.triggerHook('modules:done');

    const viteConfig = { build: {}, plugins: [] as unknown[], mode: 'production' };
    await mockNuxt.triggerHook('vite:extendConfig', viteConfig, { isServer: true, isClient: false });

    const nitroConfig = { rollupConfig: { plugins: [] as unknown[], output: {} }, dev: false };
    await mockNuxt.triggerHook('nitro:config', nitroConfig);

    expect(mockSentryVitePlugin).toHaveBeenCalled();
    expect(mockSentryRollupPlugin).toHaveBeenCalled();

    expect(viteConfig.plugins.length).toBeGreaterThan(0);
    expect(nitroConfig.rollupConfig.plugins.length).toBeGreaterThan(0);

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('[Sentry]'));
  });

  it('should not call source map related functions in dev mode', async () => {
    const { setupSourceMaps } = await import('../../src/vite/sourceMaps');
    const mockNuxt = createMockNuxt({ _prepare: false, dev: true });

    setupSourceMaps({ debug: true }, mockNuxt as unknown as Nuxt);

    await mockNuxt.triggerHook('modules:done');
    await mockNuxt.triggerHook(
      'vite:extendConfig',
      { build: {}, plugins: [], mode: 'development' },
      { isServer: true, isClient: false },
    );
    await mockNuxt.triggerHook('nitro:config', { rollupConfig: { plugins: [] }, dev: true });

    expect(mockSentryVitePlugin).not.toHaveBeenCalled();
    expect(mockSentryRollupPlugin).not.toHaveBeenCalled();
  });
});
