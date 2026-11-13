// @vitest-environment node
import type { SentryVitePluginInternalOptions } from '@sentry/bundler-plugins/vite';
import type { BuildEnvironmentOptions, Plugin, UserConfig } from 'vite';
import { mergeConfig } from 'vite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sentryTanstackStart, type SentryTanstackStartOptions } from '../../src/vite/sentryTanstackStart';

let sentryVitePluginOptions: SentryVitePluginInternalOptions | undefined;

vi.mock('@sentry/bundler-plugins/vite', () => ({
  sentryVitePlugin: (options: SentryVitePluginInternalOptions) => {
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

function callConfigHook(plugin: Plugin, config: UserConfig): UserConfig {
  return (plugin.config as (config: UserConfig) => UserConfig | undefined)(config) ?? {};
}

/** The source map setting that applies to the output of an environment. */
function getOutputSourceMapSetting(build: BuildEnvironmentOptions): unknown {
  return getOwnOutputSourceMapSetting(build) ?? build.sourcemap;
}

/** Like the bundler plugin, reads `rolldownOptions` and falls back to `rollupOptions`. */
function getOwnOutputSourceMapSetting(build: BuildEnvironmentOptions): unknown {
  const output = (build.rolldownOptions ?? build.rollupOptions)?.output;
  return Array.isArray(output) ? undefined : output?.sourcemap;
}

/**
 * Runs Sentry's source map plugins in the order of a build with `nitro/vite`, which configures Nitro between the
 * `config` hooks of the Sentry plugins with `enforce: 'pre'` and `enforce: 'post'`.
 */
function build({
  vite = {},
  nitro: nitroOptions = {},
  options = {},
}: {
  vite?: UserConfig;
  nitro?: NitroOptions;
  options?: SentryTanstackStartOptions;
}) {
  const plugins = sentryTanstackStart(options);
  // Not added when source maps are disabled.
  const nitroPlugin = plugins.find(plugin => plugin.name === 'sentry-tanstackstart-nitro-source-maps') as
    | NitroModulePlugin
    | undefined;

  const viteConfig = structuredClone(vite);
  if (nitroPlugin) {
    callConfigHook(nitroPlugin, viteConfig);
  }

  const nitro = {
    options: {
      sourcemap: nitroOptions.sourcemap ?? false,
      experimental: {},
      _c12: { layers: [{ config: nitroOptions }] },
    },
  };
  nitroPlugin?.nitro.setup(nitro);

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
  const enablePlugin = plugins.find(plugin => plugin.name === 'sentry-tanstackstart-react-source-maps');
  const userConfig: UserConfig = enablePlugin
    ? mergeConfig(configWithNitro, callConfigHook(enablePlugin, configWithNitro))
    : configWithNitro;

  const environments = Object.fromEntries(
    ENVIRONMENT_NAMES.map(name => [
      name,
      mergeConfig({ outDir: 'dist', ...userConfig.build }, userConfig.environments?.[name]?.build ?? {}),
    ]),
  ) as Record<(typeof ENVIRONMENT_NAMES)[number], BuildEnvironmentOptions>;

  return {
    client: getOutputSourceMapSetting(environments.client),
    ssr: getOutputSourceMapSetting(environments.ssr),
    nitro: getOutputSourceMapSetting(environments.nitro),
    deleted: ENVIRONMENT_NAMES.filter(name => isDeletedByBundlerPlugin(userConfig, name, environments[name])),
  };
}

/**
 * Mirrors the decision of the bundler plugin: it passes the name of an environment with its own `build.sourcemap` to
 * the function options. It removes the maps of an output with its own `sourcemap` if they are hidden, or if
 * `sdkEnabledSourceMaps` is true and they are not inline.
 */
function isDeletedByBundlerPlugin(userConfig: UserConfig, name: string, build: BuildEnvironmentOptions): boolean {
  const environment = userConfig.environments?.[name]?.build?.sourcemap !== undefined ? name : undefined;
  const { deleteSourcemapsAfterUpload, sdkEnabledSourceMaps } = sentryVitePluginOptions?.sourcemaps ?? {};
  const deleteOption =
    typeof deleteSourcemapsAfterUpload === 'function'
      ? deleteSourcemapsAfterUpload(environment)
      : deleteSourcemapsAfterUpload;
  const sdkEnabled =
    typeof sdkEnabledSourceMaps === 'function' ? sdkEnabledSourceMaps(environment) : sdkEnabledSourceMaps;
  const outputSourceMap = getOwnOutputSourceMapSetting(build);
  if (deleteOption !== true) {
    return false;
  }
  if (outputSourceMap === undefined) {
    return build.sourcemap !== false;
  }
  return outputSourceMap === 'hidden' || (sdkEnabled === true && outputSourceMap === true);
}

describe('source map scenarios of a build with Nitro', () => {
  beforeEach(() => {
    sentryVitePluginOptions = undefined;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each<{ label: string; vite?: UserConfig; nitro?: NitroOptions; expected: ReturnType<typeof build> }>([
    {
      label: 'nothing',
      expected: { client: 'hidden', ssr: 'hidden', nitro: 'hidden', deleted: ['client', 'nitro'] },
    },
    {
      label: 'nitro({ sourcemap: true })',
      nitro: { sourcemap: true },
      expected: { client: 'hidden', ssr: true, nitro: true, deleted: ['client'] },
    },
    {
      label: 'nitro({ sourcemap: false })',
      nitro: { sourcemap: false },
      expected: { client: 'hidden', ssr: false, nitro: false, deleted: ['client'] },
    },
    {
      label: 'nitro({ rollupConfig: { output: { sourcemap: true } } })',
      nitro: { rollupConfig: { output: { sourcemap: true } } },
      expected: { client: 'hidden', ssr: false, nitro: true, deleted: ['client'] },
    },
    {
      label: 'nitro({ rolldownConfig: { output: { sourcemap: true } } })',
      nitro: { rolldownConfig: { output: { sourcemap: true } } },
      expected: { client: 'hidden', ssr: false, nitro: true, deleted: ['client'] },
    },
    {
      label: 'build.sourcemap: true',
      vite: { build: { sourcemap: true } },
      expected: { client: true, ssr: 'hidden', nitro: 'hidden', deleted: ['nitro'] },
    },
    {
      label: "build.sourcemap: 'hidden'",
      vite: { build: { sourcemap: 'hidden' } },
      expected: { client: 'hidden', ssr: 'hidden', nitro: 'hidden', deleted: ['nitro'] },
    },
    {
      label: 'build.sourcemap: false',
      vite: { build: { sourcemap: false } },
      expected: { client: false, ssr: false, nitro: false, deleted: [] },
    },
    {
      label: 'environments.client.build.sourcemap: true',
      vite: { environments: { client: { build: { sourcemap: true } } } },
      expected: { client: true, ssr: 'hidden', nitro: 'hidden', deleted: ['nitro'] },
    },
    {
      label: 'environments.client.build.sourcemap: false',
      vite: { environments: { client: { build: { sourcemap: false } } } },
      expected: { client: false, ssr: 'hidden', nitro: 'hidden', deleted: ['nitro'] },
    },
    {
      label: 'build.rolldownOptions.output.sourcemap: true',
      vite: { build: { rolldownOptions: { output: { sourcemap: true } } } },
      expected: { client: true, ssr: true, nitro: true, deleted: [] },
    },
    {
      label: 'build.rolldownOptions.output.sourcemap: false',
      vite: { build: { rolldownOptions: { output: { sourcemap: false } } } },
      expected: { client: false, ssr: false, nitro: false, deleted: [] },
    },
    {
      label: 'environments.client.build.rolldownOptions.output.sourcemap: true',
      vite: { environments: { client: { build: { rolldownOptions: { output: { sourcemap: true } } } } } },
      expected: { client: true, ssr: 'hidden', nitro: 'hidden', deleted: ['client', 'nitro'] },
    },
    {
      label: "environments.client.build.rolldownOptions.output.sourcemap: 'hidden'",
      vite: { environments: { client: { build: { rolldownOptions: { output: { sourcemap: 'hidden' } } } } } },
      expected: { client: 'hidden', ssr: 'hidden', nitro: 'hidden', deleted: ['client', 'nitro'] },
    },
    {
      label: 'environments.client.build.rollupOptions.output.sourcemap: true',
      vite: { environments: { client: { build: { rollupOptions: { output: { sourcemap: true } } } } } },
      expected: { client: true, ssr: 'hidden', nitro: 'hidden', deleted: ['client', 'nitro'] },
    },
    {
      label: "environments.client.build.rollupOptions.output.sourcemap: 'hidden'",
      vite: { environments: { client: { build: { rollupOptions: { output: { sourcemap: 'hidden' } } } } } },
      expected: { client: 'hidden', ssr: 'hidden', nitro: 'hidden', deleted: ['client', 'nitro'] },
    },
  ])('deletes the expected source maps when the user sets $label', scenario => {
    expect(build(scenario)).toEqual(scenario.expected);
  });

  it.each<{ label: string; options: SentryTanstackStartOptions; expected: ReturnType<typeof build> }>([
    {
      label: "sourcemaps.disable: 'disable-upload'",
      options: { sourcemaps: { disable: 'disable-upload' } },
      expected: { client: undefined, ssr: false, nitro: false, deleted: [] },
    },
    {
      label: 'sourcemaps.deleteSourcemapsAfterUpload: false',
      options: { sourcemaps: { deleteSourcemapsAfterUpload: false } },
      expected: { client: 'hidden', ssr: 'hidden', nitro: 'hidden', deleted: [] },
    },
    {
      label: 'sourcemaps.filesToDeleteAfterUpload',
      options: { sourcemaps: { filesToDeleteAfterUpload: ['.output/**/*.map'] } },
      expected: { client: 'hidden', ssr: 'hidden', nitro: 'hidden', deleted: ['client', 'nitro'] },
    },
  ])('follows the Sentry option $label', ({ options, expected }) => {
    expect(build({ options })).toEqual(expected);
  });
});
