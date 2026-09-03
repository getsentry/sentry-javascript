import * as path from 'path';
import type { Plugin } from 'vite';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VIRTUAL_GLOBAL_VALUES_FILE } from '../../src/vite/injectGlobalValues';
import { createKitConfigResolver, isNativeServerTracingEnabled } from '../../src/vite/kitConfig';
import { sentrySvelteKit } from '../../src/vite/sentryVitePlugins';

const loadSvelteConfig = vi.hoisted(() => vi.fn().mockResolvedValue({}));

vi.mock('../../src/vite/svelteConfig', async () => {
  const actual = (await vi.importActual('../../src/vite/svelteConfig')) as object;
  return { ...actual, loadSvelteConfig };
});

/** The SvelteKit Vite plugin exposes the resolved SvelteKit config on its plugin `api`. */
function kitPlugin(options: unknown): Plugin {
  return { name: 'vite-plugin-sveltekit-setup', api: { options } } as Plugin;
}

/** SvelteKit resolves config paths against the cwd before exposing them, so fixtures must be absolute. */
function fromCwd(...segments: string[]): string {
  return path.join(process.cwd(), ...segments);
}

function callConfigHook(resolver: ReturnType<typeof createKitConfigResolver>, plugins: unknown): void {
  // @ts-expect-error this hook exists and is callable
  resolver.plugin.config({ plugins });
}

function callConfigResolvedHook(resolver: ReturnType<typeof createKitConfigResolver>, plugins: unknown): Promise<void> {
  // @ts-expect-error this hook exists and is callable
  return resolver.plugin.configResolved({ plugins, build: {} });
}

describe('createKitConfigResolver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadSvelteConfig.mockResolvedValue({});
  });

  it('returns a plugin that runs before other plugins', () => {
    const resolver = createKitConfigResolver();

    expect(resolver.plugin.name).toEqual('sentry-sveltekit-kit-config-resolver');
    expect(resolver.plugin.enforce).toEqual('pre');
  });

  describe('from the SvelteKit Vite plugin `api.options`', () => {
    it('reads the flat config of SvelteKit 3', async () => {
      const resolver = createKitConfigResolver();

      callConfigHook(resolver, [
        { name: 'some-other-plugin' },
        kitPlugin({ outDir: fromCwd('custom-out'), files: { hooks: { server: fromCwd('src/my-hooks.server') } } }),
      ]);

      await expect(resolver.get()).resolves.toEqual({
        outDir: 'custom-out',
        files: { hooks: { server: 'src/my-hooks.server' } },
      });
    });

    it('flattens the `kit`-nested config of SvelteKit 2', async () => {
      const resolver = createKitConfigResolver();

      callConfigHook(resolver, [kitPlugin({ preprocess: {}, kit: { outDir: fromCwd('custom-out') } })]);

      await expect(resolver.get()).resolves.toEqual({ outDir: 'custom-out' });
    });

    // SvelteKit hands us absolute, platform-separated paths; everything downstream (the hooks file
    // regexp, the injected output dir, the source map globs) needs them relative to the project and
    // `/`-separated, or it silently stops matching.
    it('relativizes the absolute paths SvelteKit resolves', async () => {
      const resolver = createKitConfigResolver();

      callConfigHook(resolver, [
        kitPlugin({
          kit: {
            outDir: fromCwd('.svelte-kit'),
            files: {
              routes: fromCwd('src/routes'),
              hooks: { client: fromCwd('src/hooks.client'), server: fromCwd('src/hooks.server') },
            },
          },
        }),
      ]);

      await expect(resolver.get()).resolves.toEqual({
        outDir: '.svelte-kit',
        files: {
          routes: fromCwd('src/routes'),
          hooks: { client: 'src/hooks.client', server: 'src/hooks.server' },
        },
      });
    });

    it('leaves already-relative paths alone', async () => {
      const resolver = createKitConfigResolver();

      callConfigHook(resolver, [kitPlugin({ kit: { outDir: '.svelte-kit', files: { hooks: {} } } })]);

      await expect(resolver.get()).resolves.toEqual({ outDir: '.svelte-kit', files: { hooks: {} } });
    });

    it('finds the plugin in nested plugin arrays', async () => {
      const resolver = createKitConfigResolver();

      callConfigHook(resolver, [[{ name: 'some-other-plugin' }], [kitPlugin({ outDir: 'nested' })]]);

      await expect(resolver.get()).resolves.toEqual({ outDir: 'nested' });
    });

    it('skips entries that are still unresolved promises', async () => {
      const resolver = createKitConfigResolver();

      callConfigHook(resolver, [Promise.resolve([{ name: 'some-plugin' }]), kitPlugin({ outDir: 'from-plugin' })]);

      await expect(resolver.get()).resolves.toEqual({ outDir: 'from-plugin' });
    });

    it('resolves in `configResolved` if the plugin was not visible in `config` yet', async () => {
      const resolver = createKitConfigResolver();

      callConfigHook(resolver, [Promise.resolve(kitPlugin({ outDir: 'late' }))]);
      await callConfigResolvedHook(resolver, [kitPlugin({ outDir: 'late' })]);

      await expect(resolver.get()).resolves.toEqual({ outDir: 'late' });
      expect(loadSvelteConfig).not.toHaveBeenCalled();
    });

    it('keeps the config from the `config` hook, even if `configResolved` runs later', async () => {
      const resolver = createKitConfigResolver();

      callConfigHook(resolver, [kitPlugin({ outDir: 'first' })]);
      await callConfigResolvedHook(resolver, [kitPlugin({ outDir: 'second' })]);

      await expect(resolver.get()).resolves.toEqual({ outDir: 'first' });
    });
  });

  describe('svelte.config.js fallback', () => {
    it('falls back if no SvelteKit plugin is registered', async () => {
      loadSvelteConfig.mockResolvedValue({ kit: { outDir: 'from-svelte-config' } });
      const resolver = createKitConfigResolver();

      callConfigHook(resolver, [{ name: 'some-other-plugin' }]);
      await callConfigResolvedHook(resolver, [{ name: 'some-other-plugin' }]);

      await expect(resolver.get()).resolves.toEqual({ outDir: 'from-svelte-config' });
    });

    it('falls back if the SvelteKit plugin exposes no options', async () => {
      loadSvelteConfig.mockResolvedValue({ kit: { outDir: 'from-svelte-config' } });
      const resolver = createKitConfigResolver();

      await callConfigResolvedHook(resolver, [{ name: 'vite-plugin-sveltekit-setup' }]);

      await expect(resolver.get()).resolves.toEqual({ outDir: 'from-svelte-config' });
    });

    it('resolves to an empty config if there is no svelte.config.js either', async () => {
      const resolver = createKitConfigResolver();

      await callConfigResolvedHook(resolver, undefined);

      await expect(resolver.get()).resolves.toEqual({});
    });
  });
});

describe('isNativeServerTracingEnabled', () => {
  it.each([
    ['SvelteKit 3 (>= next.8)', { tracing: { server: true } }, true],
    ['SvelteKit 2.31+ / early Kit 3 prereleases', { experimental: { tracing: { server: true } } }, true],
    ['explicitly disabled', { tracing: { server: false } }, false],
    ['not configured', {}, false],
  ])('returns %s -> %s', (_name, config, expected) => {
    expect(isNativeServerTracingEnabled(config)).toBe(expected);
  });
});

describe('resolution through a real Vite config resolution', () => {
  // The unit tests above invoke the hooks by hand, so they'd still pass if the ordering invariant
  // broke. This lets Vite drive them instead, against the real shape: an async `sveltekit()`
  // factory (which hides the plugin from `config` hooks), and source map upload enabled so the
  // plugins that consume the config are actually registered.
  function sveltekitLike(options: unknown): Promise<Plugin[]> {
    return Promise.resolve([{ name: 'vite-plugin-sveltekit-setup', api: { options } } as Plugin]);
  }

  it('resolves the SvelteKit config when Vite runs the plugins', async () => {
    const { resolveConfig } = await import('vite');

    const sentryPlugins = await sentrySvelteKit({ autoUploadSourceMaps: true, autoInstrument: false });

    const resolved = await resolveConfig(
      {
        configFile: false,
        logLevel: 'error',
        plugins: [sentryPlugins, sveltekitLike({ kit: { outDir: fromCwd('resolved-through-vite') } })],
      },
      'build',
    );

    expect(resolved.plugins.map(plugin => plugin.name)).toContain('sentry-sveltekit-kit-config-resolver');

    const globalValuesPlugin = resolved.plugins.find(
      plugin => plugin.name === 'sentry-sveltekit-global-values-injection-plugin',
    )!;

    // @ts-expect-error this hook exists and is callable
    const result = await globalValuesPlugin.load(VIRTUAL_GLOBAL_VALUES_FILE);

    // `.svelte-kit` is the default; `resolved-through-vite` proves the plugin config was read
    expect(result.code).toContain('resolved-through-vite/output');
  });
});
