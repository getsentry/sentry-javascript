import type { Plugin } from 'vite';
import { describe, expect, it, vi } from 'vitest';
import { getGlobalValueInjectionCode, VIRTUAL_GLOBAL_VALUES_FILE } from '../../src/vite/injectGlobalValues';
import { sentrySvelteKit } from '../../src/vite/sentryVitePlugins';

describe('getGlobalValueInjectionCode', () => {
  it('returns code that injects values into the global object', () => {
    const injectionCode = getGlobalValueInjectionCode({
      __sentry_sveltekit_output_dir: '.svelte-kit/output',
    });

    expect(injectionCode).toMatchInlineSnapshot(`
      "globalThis["__sentry_sveltekit_output_dir"] = ".svelte-kit/output";
      "
    `);

    // Check that the code above is in fact valid and works as expected
    // The return value of eval here is the value of the last expression in the code
    eval(injectionCode);
    expect(globalThis.__sentry_sveltekit_output_dir).toEqual('.svelte-kit/output');

    delete globalThis.__sentry_sveltekit_output_dir;
  });

  it('returns empty string if no values are passed', () => {
    expect(getGlobalValueInjectionCode({})).toEqual('');
  });
});

function getGlobalValuesPlugin(plugins: Plugin[]): Plugin {
  return plugins.find(plugin => plugin.name === 'sentry-sveltekit-global-values-injection-plugin')!;
}

describe('global values injection plugin', () => {
  // The whole chain: the SvelteKit Vite plugin's `api.options` -> kit config resolver ->
  // adapter detection -> adapter output dir + hooks file. Before SvelteKit 3 this came from
  // `svelte.config.js`, which no longer exists there.
  async function getPluginsForKitConfig(kitConfigOptions: unknown): Promise<Plugin[]> {
    const plugins = await sentrySvelteKit({ autoUploadSourceMaps: true, autoInstrument: false });

    const resolver = plugins.find(plugin => plugin.name === 'sentry-sveltekit-kit-config-resolver')!;
    // @ts-expect-error this hook exists and is callable
    resolver.config({
      plugins: [{ name: 'vite-plugin-sveltekit-setup', api: { options: kitConfigOptions } }],
    });

    return plugins;
  }

  const nodeAdapterWithCustomOutDir = {
    name: '@sveltejs/adapter-node',
    adapt: (builder: { writeClient: (dest: string) => void }) => {
      builder.writeClient('custom-build/client');
    },
  };

  it("injects the adapter's custom output directory", async () => {
    const plugins = await getPluginsForKitConfig({ adapter: nodeAdapterWithCustomOutDir });

    // @ts-expect-error this hook exists and is callable
    const result = await getGlobalValuesPlugin(plugins).load(VIRTUAL_GLOBAL_VALUES_FILE);

    expect(result.code).toContain('globalThis["__sentry_sveltekit_output_dir"] = "custom-build";');
  });

  it('injects into a custom server hooks file', async () => {
    const plugins = await getPluginsForKitConfig({
      adapter: nodeAdapterWithCustomOutDir,
      files: { hooks: { server: 'src/my-hooks.server' } },
    });
    const plugin = getGlobalValuesPlugin(plugins);

    // @ts-expect-error this hook exists and is callable
    const customHooksResult = await plugin.transform('const a = 1;', '/project/src/my-hooks.server.ts');
    // @ts-expect-error this hook exists and is callable
    const defaultHooksResult = await plugin.transform('const a = 1;', '/project/src/hooks.server.ts');

    expect(customHooksResult.code).toContain(VIRTUAL_GLOBAL_VALUES_FILE);
    expect(defaultHooksResult).toBeNull();
  });

  it('falls back to the default output directory if the config has no adapter', async () => {
    const plugins = await getPluginsForKitConfig({});

    // @ts-expect-error this hook exists and is callable
    const result = await getGlobalValuesPlugin(plugins).load(VIRTUAL_GLOBAL_VALUES_FILE);

    expect(result.code).toContain('globalThis["__sentry_sveltekit_output_dir"]');
  });
});

describe('adapter output dir resolution', () => {
  // Resolving the output directory for the Node adapter means calling `adapter.adapt()`, and
  // `@sveltejs/adapter-node` v6 wipes the output directory when it runs. So it has to happen
  // once, at config time - if it were deferred to e.g. the source maps plugin's `closeBundle`,
  // it would delete the app SvelteKit just built.
  it('resolves once, before the build, even when `filesToDeleteAfterUpload` is user-specified', async () => {
    const adapt = vi.fn((builder: { writeClient: (dest: string) => void }) => {
      builder.writeClient('custom-build/client');
    });

    const plugins = await sentrySvelteKit({
      autoUploadSourceMaps: true,
      autoInstrument: false,
      sourcemaps: { filesToDeleteAfterUpload: ['./custom-build/**/*.map'] },
    });

    const resolver = plugins.find(plugin => plugin.name === 'sentry-sveltekit-kit-config-resolver')!;
    // @ts-expect-error this hook exists and is callable
    resolver.config({
      plugins: [
        {
          name: 'vite-plugin-sveltekit-setup',
          api: { options: { adapter: { name: '@sveltejs/adapter-node', adapt } } },
        },
      ],
    });

    const filesToDeletePlugin = plugins.find(
      plugin => plugin.name === 'sentry-sveltekit-files-to-delete-after-upload-setting-plugin',
    )!;
    const globalValuesPlugin = getGlobalValuesPlugin(plugins);

    // This takes the branch that leaves `filesToDeleteAfterUpload` untouched - the adapter still
    // has to be resolved by `configResolved`, not later in `closeBundle`
    // @ts-expect-error these hooks exist and are callable
    filesToDeletePlugin.config({ build: { sourcemap: true } });
    // @ts-expect-error these hooks exist and are callable
    await filesToDeletePlugin.configResolved();

    expect(adapt).toHaveBeenCalledTimes(1);

    // @ts-expect-error these hooks exist and are callable
    await globalValuesPlugin.configResolved({});
    // @ts-expect-error these hooks exist and are callable
    await globalValuesPlugin.load(VIRTUAL_GLOBAL_VALUES_FILE);

    // Shared across the plugins: the adapter must not be invoked once per consumer
    expect(adapt).toHaveBeenCalledTimes(1);
  });
});
