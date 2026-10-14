// @vitest-environment node
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { UserConfig } from 'vite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isNitroService,
  makeComposeNitroServiceSourceMapsPlugin,
  makeEnableNitroSourceMapsPlugin,
  type PluginEnvironment,
} from '../../src/vite/nitroSourceMaps';

const SSR_OUT_DIR = 'node_modules/.nitro/vite/services/ssr';

function createEnvironment(name: string, consumer: 'client' | 'server', environmentNames: string[]): PluginEnvironment {
  const environments = Object.fromEntries(environmentNames.map(environmentName => [environmentName, {}]));
  return { name, config: { consumer, environments } } as unknown as PluginEnvironment;
}

describe('isNitroService', () => {
  it.each([
    {
      label: 'the ssr environment of a Nitro build',
      name: 'ssr',
      consumer: 'server',
      environments: ['client', 'ssr', 'nitro'],
      expected: true,
    },
    {
      label: 'the nitro environment',
      name: 'nitro',
      consumer: 'server',
      environments: ['client', 'ssr', 'nitro'],
      expected: false,
    },
    {
      label: 'the client environment',
      name: 'client',
      consumer: 'client',
      environments: ['client', 'ssr', 'nitro'],
      expected: false,
    },
    {
      label: 'the ssr environment without Nitro',
      name: 'ssr',
      consumer: 'server',
      environments: ['client', 'ssr'],
      expected: false,
    },
  ] as const)('returns $expected for $label', ({ name, consumer, environments, expected }) => {
    expect(isNitroService(createEnvironment(name, consumer, [...environments]))).toBe(expected);
  });
});

describe('Nitro source map config', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  type NitroConfig = {
    sourcemap?: unknown;
    rollupConfig?: { output?: { sourcemap?: unknown } };
    rolldownConfig?: { output?: { sourcemap?: unknown } };
  };

  /** Runs the Nitro module with the config sources that Nitro merged, e.g. the `nitro()` options and `nitro.config.ts`. */
  function setup(
    layers: NitroConfig[] | undefined,
    { debug, viteConfig = {} }: { debug?: boolean; viteConfig?: UserConfig } = {},
  ) {
    const plugin = makeEnableNitroSourceMapsPlugin({ debug });
    (plugin.config as (config: UserConfig) => void)(viteConfig);
    const nitro = {
      options: { sourcemap: false, experimental: {}, _c12: layers && { layers: layers.map(config => ({ config })) } },
    };
    plugin.nitro.setup(nitro);

    return { plugin, nitroOptions: { sourcemap: nitro.options.sourcemap, experimental: nitro.options.experimental } };
  }

  it('enables hidden source maps with their sources when no config source sets them', () => {
    const { plugin, nitroOptions } = setup([{}, {}]);

    expect(nitroOptions).toEqual({ sourcemap: 'hidden', experimental: { sourcemapMinify: false } });
    expect(plugin.api.hasSentryEnabledSourceMaps('nitro')).toBe(true);
    expect(plugin.api.hasSentryEnabledSourceMaps('client')).toBe(false);
  });

  it.each([false, true, 'hidden'])(
    'keeps the setting `sourcemap: %s` of a config source, with the sources',
    sourcemap => {
      const { plugin, nitroOptions } = setup([{}, { sourcemap }]);

      expect(nitroOptions).toEqual({ sourcemap: false, experimental: { sourcemapMinify: false } });
      expect(plugin.api.hasSentryEnabledSourceMaps('nitro')).toBe(false);
    },
  );

  it.each([
    { label: '`rollupConfig.output.sourcemap`', layer: { rollupConfig: { output: { sourcemap: true } } } },
    { label: '`rolldownConfig.output.sourcemap`', layer: { rolldownConfig: { output: { sourcemap: false } } } },
  ])('keeps the source maps when a config source sets $label', ({ layer }) => {
    const { plugin, nitroOptions } = setup([{}, layer]);

    expect(nitroOptions).toEqual({ sourcemap: false, experimental: { sourcemapMinify: false } });
    expect(plugin.api.hasSentryEnabledSourceMaps('nitro')).toBe(false);
  });

  it.each([
    { label: '`build.sourcemap: false`', build: { sourcemap: false } },
    { label: '`build.rolldownOptions.output.sourcemap`', build: { rolldownOptions: { output: { sourcemap: true } } } },
  ])('keeps the source maps when the Vite config sets $label', ({ build }) => {
    const { plugin, nitroOptions } = setup([{}], { viteConfig: { build } });

    expect(nitroOptions).toEqual({ sourcemap: false, experimental: { sourcemapMinify: false } });
    expect(plugin.api.hasSentryEnabledSourceMaps('nitro')).toBe(false);
  });

  it('enables source maps when the Vite config sets `build.sourcemap: true`, which Nitro overrides', () => {
    const { plugin, nitroOptions } = setup([{}], { viteConfig: { build: { sourcemap: true } } });

    expect(nitroOptions).toEqual({ sourcemap: 'hidden', experimental: { sourcemapMinify: false } });
    expect(plugin.api.hasSentryEnabledSourceMaps('nitro')).toBe(true);
  });

  it('does not enable source maps when Nitro does not expose its config sources', () => {
    const { plugin, nitroOptions } = setup(undefined);

    expect(nitroOptions).toEqual({ sourcemap: false, experimental: { sourcemapMinify: false } });
    expect(plugin.api.hasSentryEnabledSourceMaps('nitro')).toBe(false);
  });

  it('logs that it enabled source maps in debug mode', () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    setup([], { debug: true });

    expect(consoleLogSpy).toHaveBeenCalledWith(
      "[Sentry] Enabled source map generation for the Nitro server build with `nitro.sourcemap: 'hidden'`.",
    );
  });
});

describe('Nitro service source maps', () => {
  let rootDir: string;

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentry-tanstackstart-nitro-'));
    fs.mkdirSync(path.join(rootDir, SSR_OUT_DIR, 'assets'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  function writeFile(relativePath: string, contents: string): string {
    const file = path.join(rootDir, relativePath);
    fs.writeFileSync(file, contents);
    return file;
  }

  function load(id: string): Promise<unknown> {
    const plugin = makeComposeNitroServiceSourceMapsPlugin();
    const context = {
      environment: {
        config: {
          root: rootDir,
          environments: {
            client: { consumer: 'client', build: { outDir: '.output/public' } },
            ssr: { consumer: 'server', build: { outDir: SSR_OUT_DIR } },
            nitro: { consumer: 'server', build: { outDir: '.output/server' } },
          },
        },
      },
    };
    return (plugin.load as unknown as (this: typeof context, id: string) => Promise<unknown>).call(context, id);
  }

  it('applies only to the nitro environment', () => {
    const plugin = makeComposeNitroServiceSourceMapsPlugin();
    const applyToEnvironment = plugin.applyToEnvironment as (environment: PluginEnvironment) => boolean;

    expect(applyToEnvironment(createEnvironment('nitro', 'server', ['ssr', 'nitro']))).toBe(true);
    expect(applyToEnvironment(createEnvironment('ssr', 'server', ['ssr', 'nitro']))).toBe(false);
  });

  it('loads a service chunk together with its source map', async () => {
    const map = '{"version":3,"sources":["../../../../../src/routes/index.tsx"],"mappings":"AAAA"}';
    const chunk = writeFile(`${SSR_OUT_DIR}/assets/index-BKeMB_FB.js`, 'export const handler = () => {};');
    writeFile(`${SSR_OUT_DIR}/assets/index-BKeMB_FB.js.map`, map);

    await expect(load(chunk)).resolves.toEqual({ code: 'export const handler = () => {};', map });
  });

  it('leaves a service chunk without a source map to Nitro', async () => {
    const chunk = writeFile(`${SSR_OUT_DIR}/assets/empty-plugin-adapters-BJX69BzA.js`, 'export {};');

    await expect(load(chunk)).resolves.toBeNull();
  });

  it('leaves modules outside the service output to Nitro', async () => {
    fs.mkdirSync(path.join(rootDir, 'src'), { recursive: true });
    const module = writeFile('src/server.ts', 'export default {};');
    writeFile('src/server.ts.map', '{"version":3,"sources":[],"mappings":""}');

    await expect(load(module)).resolves.toBeNull();
  });
});
