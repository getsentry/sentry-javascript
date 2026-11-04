// @vitest-environment node
import type { SentryVitePluginOptions } from '@sentry/bundler-plugins/vite';
import type { BuildEnvironmentOptions, Plugin, ResolvedConfig, UserConfig } from 'vite';
import { mergeConfig } from 'vite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sentryTanstackStart } from '../../src/vite/sentryTanstackStart';

let sentryVitePluginOptions: SentryVitePluginOptions | undefined;

vi.mock('@sentry/bundler-plugins/vite', () => ({
  sentryVitePlugin: (options: SentryVitePluginOptions) => {
    sentryVitePluginOptions = options;
    return [];
  },
}));

type SourceMapSetting = boolean | 'hidden' | 'inline' | undefined;

type NitroOptions = {
  sourcemap?: SourceMapSetting;
  rollupConfig?: { output?: { sourcemap?: SourceMapSetting } };
  rolldownConfig?: { output?: { sourcemap?: SourceMapSetting } };
};

type NitroModulePlugin = Plugin & { nitro: { setup(nitro: unknown): void } };

const ENVIRONMENT_NAMES = ['client', 'ssr', 'nitro'] as const;

function findPlugin<T extends Plugin = Plugin>(plugins: Plugin[], name: string): T {
  const plugin = plugins.find(plugin => plugin.name === name);
  expect(plugin).toBeDefined();
  return plugin as T;
}

function callConfigHook(plugin: Plugin, config: UserConfig): UserConfig {
  return (plugin.config as (config: UserConfig) => UserConfig | undefined)(config) ?? {};
}

/** The source map setting that applies to the output of an environment. */
function getOutputSourceMapSetting(build: BuildEnvironmentOptions): unknown {
  const output = build.rolldownOptions?.output;
  return (Array.isArray(output) ? undefined : output?.sourcemap) ?? build.sourcemap;
}

/**
 * Runs Sentry's source map plugins in the order of a build with `nitro/vite`, which configures Nitro between the
 * `config` hooks of the Sentry plugins with `enforce: 'pre'` and `enforce: 'post'`.
 */
async function build({ vite = {}, nitro: nitroOptions = {} }: { vite?: UserConfig; nitro?: NitroOptions }) {
  const plugins = sentryTanstackStart({});
  const nitroPlugin = findPlugin<NitroModulePlugin>(plugins, 'sentry-tanstackstart-nitro-source-maps');

  const viteConfig = structuredClone(vite);
  callConfigHook(nitroPlugin, viteConfig);

  const nitro = {
    options: {
      sourcemap: nitroOptions.sourcemap ?? false,
      experimental: {},
      _c12: { layers: [{ config: nitroOptions }] },
    },
  };
  nitroPlugin.nitro.setup(nitro);

  const nitroOutput = { ...nitroOptions.rollupConfig?.output, ...nitroOptions.rolldownConfig?.output };
  const configWithNitro: UserConfig = mergeConfig(viteConfig, {
    environments: {
      client: { build: { outDir: '.output/public' } },
      ssr: { build: { sourcemap: nitro.options.sourcemap, outDir: 'node_modules/.nitro/vite/services/ssr' } },
      nitro: {
        build: {
          sourcemap: nitro.options.sourcemap,
          rolldownOptions: { output: { ...nitroOutput, dir: '.output/server' } },
        },
      },
    },
  });
  const userConfig: UserConfig = mergeConfig(
    configWithNitro,
    callConfigHook(findPlugin(plugins, 'sentry-tanstackstart-react-source-maps'), configWithNitro),
  );

  const environments = Object.fromEntries(
    ENVIRONMENT_NAMES.map(name => [
      name,
      {
        consumer: name === 'client' ? 'client' : 'server',
        build: mergeConfig({ outDir: 'dist', ...userConfig.build }, userConfig.environments?.[name]?.build ?? {}),
      },
    ]),
  );
  const resolvedConfig = { root: process.cwd(), plugins, environments } as unknown as ResolvedConfig;
  const deletionPlugin = findPlugin(plugins, 'sentry-tanstackstart-files-to-delete-after-upload-plugin');
  (deletionPlugin.configResolved as (this: unknown, config: ResolvedConfig) => void).call(
    { meta: { viteVersion: '8.3.4' } },
    resolvedConfig,
  );

  return {
    client: getOutputSourceMapSetting(environments.client!.build),
    ssr: getOutputSourceMapSetting(environments.ssr!.build),
    nitro: getOutputSourceMapSetting(environments.nitro!.build),
    filesToDelete: await sentryVitePluginOptions?.sourcemaps?.filesToDeleteAfterUpload,
  };
}

const CLIENT_MAPS = '.output/public/**/*.map';
const SERVER_MAPS = '.output/server/**/*.map';

describe('source map scenarios of a build with Nitro', () => {
  beforeEach(() => {
    sentryVitePluginOptions = undefined;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each<{ label: string; vite?: UserConfig; nitro?: NitroOptions; expected: Awaited<ReturnType<typeof build>> }>([
    {
      label: 'nothing',
      expected: { client: 'hidden', ssr: 'hidden', nitro: 'hidden', filesToDelete: [CLIENT_MAPS, SERVER_MAPS] },
    },
    {
      label: 'nitro({ sourcemap: true })',
      nitro: { sourcemap: true },
      expected: { client: 'hidden', ssr: true, nitro: true, filesToDelete: [CLIENT_MAPS] },
    },
    {
      label: 'nitro({ sourcemap: false })',
      nitro: { sourcemap: false },
      expected: { client: 'hidden', ssr: false, nitro: false, filesToDelete: [CLIENT_MAPS] },
    },
    {
      label: 'nitro({ rollupConfig: { output: { sourcemap: true } } })',
      nitro: { rollupConfig: { output: { sourcemap: true } } },
      expected: { client: 'hidden', ssr: false, nitro: true, filesToDelete: [CLIENT_MAPS] },
    },
    {
      label: 'nitro({ rolldownConfig: { output: { sourcemap: true } } })',
      nitro: { rolldownConfig: { output: { sourcemap: true } } },
      expected: { client: 'hidden', ssr: false, nitro: true, filesToDelete: [CLIENT_MAPS] },
    },
    {
      label: 'build.sourcemap: true',
      vite: { build: { sourcemap: true } },
      expected: { client: true, ssr: 'hidden', nitro: 'hidden', filesToDelete: [SERVER_MAPS] },
    },
    {
      label: "build.sourcemap: 'hidden'",
      vite: { build: { sourcemap: 'hidden' } },
      expected: { client: 'hidden', ssr: 'hidden', nitro: 'hidden', filesToDelete: [SERVER_MAPS] },
    },
    {
      label: 'build.sourcemap: false',
      vite: { build: { sourcemap: false } },
      expected: { client: false, ssr: false, nitro: false, filesToDelete: [] },
    },
    {
      label: 'environments.client.build.sourcemap: true',
      vite: { environments: { client: { build: { sourcemap: true } } } },
      expected: { client: true, ssr: 'hidden', nitro: 'hidden', filesToDelete: [SERVER_MAPS] },
    },
    {
      label: 'environments.client.build.sourcemap: false',
      vite: { environments: { client: { build: { sourcemap: false } } } },
      expected: { client: false, ssr: 'hidden', nitro: 'hidden', filesToDelete: [SERVER_MAPS] },
    },
    {
      label: 'build.rolldownOptions.output.sourcemap: true',
      vite: { build: { rolldownOptions: { output: { sourcemap: true } } } },
      expected: { client: true, ssr: true, nitro: true, filesToDelete: [] },
    },
    {
      label: 'build.rolldownOptions.output.sourcemap: false',
      vite: { build: { rolldownOptions: { output: { sourcemap: false } } } },
      expected: { client: false, ssr: false, nitro: false, filesToDelete: [] },
    },
    {
      label: 'environments.client.build.rolldownOptions.output.sourcemap: true',
      vite: { environments: { client: { build: { rolldownOptions: { output: { sourcemap: true } } } } } },
      expected: { client: true, ssr: 'hidden', nitro: 'hidden', filesToDelete: [SERVER_MAPS] },
    },
  ])('keeps the source maps of the user and deletes the others when the user sets $label', async scenario => {
    await expect(build(scenario)).resolves.toEqual(scenario.expected);
  });
});
