import type { Nuxt } from '@nuxt/schema';
import { describe, expect, it } from 'vitest';
import { setupModuleSyncTracing } from '../../src/vite/moduleSyncTracing';

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

describe('setupModuleSyncTracing', () => {
  describe('nitro v2', () => {
    it('sets moduleSyncCatchall in externals.traceOptions', async () => {
      const mockNuxt = createMockNuxt();
      const nitroConfig: Record<string, any> = {};

      setupModuleSyncTracing(mockNuxt as unknown as Nuxt, false);
      await mockNuxt.triggerHook('nitro:config', nitroConfig);

      expect(nitroConfig.externals.traceOptions).toEqual({ moduleSyncCatchall: true });
    });

    it('preserves existing traceOptions and lets an explicit user value win', async () => {
      const mockNuxt = createMockNuxt();
      const nitroConfig: Record<string, any> = {
        externals: { inline: ['some-pkg'], traceOptions: { base: '/', moduleSyncCatchall: false } },
      };

      setupModuleSyncTracing(mockNuxt as unknown as Nuxt, false);
      await mockNuxt.triggerHook('nitro:config', nitroConfig);

      expect(nitroConfig.externals).toEqual({
        inline: ['some-pkg'],
        traceOptions: { base: '/', moduleSyncCatchall: false },
      });
    });
  });

  describe('nitro v3', () => {
    it('sets moduleSyncCatchall in externals.trace.nft', async () => {
      const mockNuxt = createMockNuxt();
      const nitroConfig: Record<string, any> = {};

      setupModuleSyncTracing(mockNuxt as unknown as Nuxt, true);
      await mockNuxt.triggerHook('nitro:config', nitroConfig);

      expect(nitroConfig.externals.trace).toEqual({ nft: { moduleSyncCatchall: true } });
    });

    it('respects trace: false and preserves existing nft options', async () => {
      const mockNuxt = createMockNuxt();
      const disabledConfig: Record<string, any> = { externals: { trace: false } };

      setupModuleSyncTracing(mockNuxt as unknown as Nuxt, true);
      await mockNuxt.triggerHook('nitro:config', disabledConfig);

      expect(disabledConfig.externals.trace).toBe(false);

      const existingConfig: Record<string, any> = {
        externals: { trace: { nft: { base: '/', moduleSyncCatchall: false } } },
      };

      setupModuleSyncTracing(mockNuxt as unknown as Nuxt, true);
      await mockNuxt.triggerHook('nitro:config', existingConfig);

      expect(existingConfig.externals.trace.nft).toEqual({ base: '/', moduleSyncCatchall: false });
    });
  });

  it('does nothing during nuxt prepare', async () => {
    const mockNuxt = createMockNuxt({ _prepare: true });
    const nitroConfig: Record<string, any> = {};

    setupModuleSyncTracing(mockNuxt as unknown as Nuxt, false);
    await mockNuxt.triggerHook('nitro:config', nitroConfig);

    expect(nitroConfig.externals).toBeUndefined();
  });
});
