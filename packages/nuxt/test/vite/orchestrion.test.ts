import type { Nuxt } from '@nuxt/schema';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mockSentryOrchestrionPlugin = vi.fn(() => ({ name: 'sentry-orchestrion-plugin' }));

function createMockNuxt(options: { _prepare?: boolean } = {}) {
  const hooks: Record<string, Array<(...args: any[]) => void | Promise<void>>> = {};

  return {
    options: { _prepare: options._prepare ?? false },
    hook: (name: string, callback: (...args: any[]) => void | Promise<void>) => {
      hooks[name] = hooks[name] || [];
      hooks[name].push(callback);
    },
    triggerHook: async (name: string, ...args: any[]) => {
      for (const callback of hooks[name] || []) {
        await callback(...args);
      }
    },
  };
}

describe('setupOrchestrion', () => {
  beforeAll(() => {
    vi.doMock('@sentry/server-utils/orchestrion/config', () => ({
      INSTRUMENTED_MODULE_NAMES: ['mysql', 'ioredis'],
    }));
    vi.doMock('@sentry/server-utils/orchestrion/rollup', () => ({
      sentryOrchestrionPlugin: mockSentryOrchestrionPlugin,
    }));
  });

  afterAll(() => {
    vi.doUnmock('@sentry/server-utils/orchestrion/config');
    vi.doUnmock('@sentry/server-utils/orchestrion/rollup');
  });

  beforeEach(() => {
    mockSentryOrchestrionPlugin.mockClear();
  });

  it('adds the transformer and preserves existing inline dependencies', async () => {
    const { setupOrchestrion } = await import('../../src/vite/orchestrion');
    const mockNuxt = createMockNuxt();
    const existingPlugin = { name: 'existing-plugin' };
    const nitroConfig = {
      rollupConfig: { plugins: existingPlugin },
      externals: { inline: ['ioredis', 'custom-dependency'] },
    };

    setupOrchestrion(mockNuxt as unknown as Nuxt);
    await mockNuxt.triggerHook('nitro:config', nitroConfig);

    expect(mockSentryOrchestrionPlugin).toHaveBeenCalledOnce();
    expect(nitroConfig.rollupConfig.plugins).toEqual([existingPlugin, { name: 'sentry-orchestrion-plugin' }]);
    expect(nitroConfig.externals.inline).toEqual(['ioredis', 'custom-dependency', 'mysql', 'standard-as-callback']);
  });

  it('initializes absent Nitro configuration', async () => {
    const { setupOrchestrion } = await import('../../src/vite/orchestrion');
    const mockNuxt = createMockNuxt();
    const nitroConfig = {};

    setupOrchestrion(mockNuxt as unknown as Nuxt);
    await mockNuxt.triggerHook('nitro:config', nitroConfig);

    expect(nitroConfig).toEqual({
      rollupConfig: { plugins: [{ name: 'sentry-orchestrion-plugin' }] },
      externals: { inline: ['mysql', 'ioredis', 'standard-as-callback'] },
    });
  });

  it('does not change Nitro configuration in prepare mode', async () => {
    const { setupOrchestrion } = await import('../../src/vite/orchestrion');
    const mockNuxt = createMockNuxt({ _prepare: true });
    const nitroConfig = { rollupConfig: { plugins: [] } };

    setupOrchestrion(mockNuxt as unknown as Nuxt);
    await mockNuxt.triggerHook('nitro:config', nitroConfig);

    expect(mockSentryOrchestrionPlugin).not.toHaveBeenCalled();
    expect(nitroConfig).toEqual({ rollupConfig: { plugins: [] } });
  });
});
