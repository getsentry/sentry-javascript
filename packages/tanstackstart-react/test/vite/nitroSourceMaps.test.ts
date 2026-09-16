// @vitest-environment node
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Plugin, UserConfig } from 'vite';
import { mergeConfig } from 'vite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeNitroSourceMapsPlugin, rewriteTanstackStartSources } from '../../src/vite/nitroSourceMaps';

type ViteConfigWithNitro = UserConfig & { nitro?: Record<string, unknown> };

type IntermediateSsrPlugin = {
  name: string;
  load: (id: string) => Promise<{ code: string; map: string } | null>;
};

function callConfigHook(plugin: Plugin, config: ViteConfigWithNitro = {}): ViteConfigWithNitro | undefined {
  const hook = plugin.config;
  const handler = typeof hook === 'function' ? hook : hook?.handler;
  return handler?.call({} as never, config as UserConfig, {
    command: 'build',
    mode: 'production',
  }) as ViteConfigWithNitro | undefined;
}

function getIntermediateSsrPlugin(contributed: ViteConfigWithNitro | undefined): IntermediateSsrPlugin {
  const plugins = (contributed?.nitro as { rollupConfig?: { plugins?: IntermediateSsrPlugin[] } } | undefined)
    ?.rollupConfig?.plugins;
  const plugin = plugins?.[0];
  if (!plugin) {
    throw new Error('Expected a load-intermediate-ssr-sourcemaps rollup plugin');
  }
  return plugin;
}

describe('rewriteTanstackStartSources()', () => {
  it('strips TanStack virtual-module suffixes and leading parent segments', () => {
    expect(rewriteTanstackStartSources('../../../src/routes/index.tsx?tss-serverfn-split')).toBe(
      './src/routes/index.tsx',
    );
  });

  it('leaves already-normalized paths unchanged', () => {
    expect(rewriteTanstackStartSources('./src/routes/index.tsx')).toBe('./src/routes/index.tsx');
    expect(rewriteTanstackStartSources('src/routes/index.tsx')).toBe('src/routes/index.tsx');
  });
});

describe('makeNitroSourceMapsPlugin()', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {
      /* noop */
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {
      /* noop */
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is enforced as 'pre' so it runs before nitro's own config hook", () => {
    const plugin = makeNitroSourceMapsPlugin({});

    expect(plugin.name).toBe('sentry-tanstackstart-nitro-source-maps');
    expect(plugin.apply).toBe('build');
    expect(plugin.enforce).toBe('pre');
  });

  it('enables hidden source maps and opts out of nitro sourcemap minification', () => {
    const contributed = callConfigHook(makeNitroSourceMapsPlugin({}));

    expect(contributed?.nitro).toMatchObject({
      sourcemap: 'hidden',
      experimental: { sourcemapMinify: false },
    });
  });

  it("keeps the user's explicit nitro source map setting", () => {
    const userConfig: ViteConfigWithNitro = { nitro: { sourcemap: true } };
    const merged = mergeConfig(userConfig, callConfigHook(makeNitroSourceMapsPlugin({}), userConfig) ?? {});

    expect((merged as ViteConfigWithNitro).nitro).toMatchObject({
      sourcemap: true,
      experimental: { sourcemapMinify: false },
    });
  });

  it('does not enable nitro source maps when the user disabled them', () => {
    const contributed = callConfigHook(makeNitroSourceMapsPlugin({}), { nitro: { sourcemap: false } });

    expect(contributed?.nitro).toEqual({});
    expect(console.warn).toHaveBeenCalled();
  });

  it('does not enable nitro source maps when they are inline', () => {
    const contributed = callConfigHook(makeNitroSourceMapsPlugin({}), { nitro: { sourcemap: 'inline' } });

    expect(contributed?.nitro).toEqual({});
    expect(console.warn).toHaveBeenCalled();
  });

  it("does not duplicate the user's nitro arrays once Vite merges the result", () => {
    const userConfig: ViteConfigWithNitro = {
      nitro: { rollupConfig: { plugins: [{ name: 'user-plugin' }] } },
    };

    const merged = mergeConfig(userConfig, callConfigHook(makeNitroSourceMapsPlugin({}), userConfig) ?? {});
    const plugins = ((merged as ViteConfigWithNitro).nitro as { rollupConfig?: { plugins?: { name?: string }[] } })
      ?.rollupConfig?.plugins;

    expect(plugins?.map(plugin => plugin.name)).toEqual([
      'user-plugin',
      'sentry-tanstackstart-load-intermediate-ssr-sourcemaps',
    ]);
  });

  it('does not mutate the config object it is handed', () => {
    const userConfig: ViteConfigWithNitro = { nitro: {} };

    callConfigHook(makeNitroSourceMapsPlugin({}), userConfig);

    expect(userConfig.nitro).toEqual({});
  });

  describe('intermediate SSR source maps', () => {
    it('loads adjacent maps for Nitro Vite SSR intermediates', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'sentry-tanstackstart-ssr-'));
      const ssrDir = join(dir, '.nitro', 'vite', 'services', 'ssr');
      await mkdir(ssrDir, { recursive: true });
      const file = join(ssrDir, 'routes.js');
      await writeFile(file, 'throw new Error("test")\n');
      await writeFile(`${file}.map`, '{"version":3,"sources":["src/routes/index.tsx"],"mappings":""}\n');

      const plugin = getIntermediateSsrPlugin(callConfigHook(makeNitroSourceMapsPlugin({})));
      const result = await plugin.load(file);

      expect(result).toEqual({
        code: 'throw new Error("test")\n',
        map: '{"version":3,"sources":["src/routes/index.tsx"],"mappings":""}\n',
      });
    });

    it('ignores modules that are not Nitro Vite SSR intermediates', async () => {
      const plugin = getIntermediateSsrPlugin(callConfigHook(makeNitroSourceMapsPlugin({})));

      expect(await plugin.load('/project/src/routes/index.js')).toBeNull();
    });

    it('returns null when the adjacent map file is missing', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'sentry-tanstackstart-ssr-'));
      const ssrDir = join(dir, '.nitro', 'vite', 'services', 'ssr');
      await mkdir(ssrDir, { recursive: true });
      const file = join(ssrDir, 'routes.js');
      await writeFile(file, 'throw new Error("test")\n');

      const plugin = getIntermediateSsrPlugin(callConfigHook(makeNitroSourceMapsPlugin({})));

      expect(await plugin.load(file)).toBeNull();
    });
  });
});
