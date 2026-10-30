import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import type { BuildEnvironmentOptions, Plugin, ResolvedConfig } from 'vite';

/** `nitro/vite` builds the final server in an environment with this name. */
const NITRO_ENVIRONMENT = 'nitro';

/** The environment Vite passes to `applyToEnvironment`. */
export type PluginEnvironment = Parameters<NonNullable<Plugin['applyToEnvironment']>>[0];

type BundlerSourceMapConfig = { output?: { sourcemap?: unknown } };

type NitroSourceMapConfig = {
  sourcemap?: unknown;
  rollupConfig?: BundlerSourceMapConfig;
  rolldownConfig?: BundlerSourceMapConfig;
};

/** The parts of the Nitro instance that this plugin uses. */
type Nitro = {
  options: {
    sourcemap: unknown;
    experimental: { sourcemapMinify?: false };
    // c12 keeps each config source that Nitro merged: the `nitro()` options, `nitro.config.ts`, presets and more.
    // It is internal until Nitro exposes the layers: https://github.com/nitrojs/nitro/issues/4771
    _c12?: { layers?: { config?: NitroSourceMapConfig | null }[] };
  };
};

/**
 * Tells the plugin that deletes source maps after the upload whether the source maps of an environment are only
 * there because Sentry enabled them.
 */
export type SourceMapsEnablerApi = { hasSentryEnabledSourceMaps(environmentName: string): boolean };

/**
 * Whether Nitro bundles the output of this environment again. With `nitro/vite`, every server environment besides
 * `nitro` is a Nitro service, such as TanStack Start's `ssr` environment.
 */
export function isNitroService(environment: PluginEnvironment): boolean {
  return (
    environment.name !== NITRO_ENVIRONMENT &&
    environment.config.consumer === 'server' &&
    NITRO_ENVIRONMENT in environment.config.environments
  );
}

/**
 * Keeps the sources in the source maps of Nitro's server build. Enables these source maps, unless a Nitro config
 * source or `build.rolldownOptions.output.sourcemap` of the Vite config sets them, or the Vite config disables them.
 */
export function makeEnableNitroSourceMapsPlugin({ debug }: { debug?: boolean }): Plugin & {
  api: SourceMapsEnablerApi;
  nitro: { name: string; setup: (nitro: Nitro) => void };
} {
  let enabledSourceMaps = false;
  let viteConfigPreventsSourceMaps = false;

  return {
    name: 'sentry-tanstackstart-nitro-source-maps',
    apply: 'build',
    // The `config` hook must run before the one of `nitro/vite`, which runs the Nitro modules.
    enforce: 'pre',
    api: {
      hasSentryEnabledSourceMaps: environmentName => enabledSourceMaps && environmentName === NITRO_ENVIRONMENT,
    },
    config(viteConfig) {
      // Nitro overrides `build.sourcemap` for its environments, but `false` shows that the user wants no source maps.
      viteConfigPreventsSourceMaps =
        viteConfig.build?.sourcemap === false || hasOutputSourceMapSetting(viteConfig.build);
    },
    // `nitro/vite` installs the Nitro module of each Vite plugin after it merged all config sources.
    nitro: {
      name: 'sentry-tanstackstart-nitro-source-maps',
      setup(nitro) {
        // Otherwise Nitro removes `sourcesContent` from its source maps, and `mappings` from maps with only
        // `node_modules` sources. Nitro only allows `false`.
        nitro.options.experimental.sourcemapMinify = false;

        const layers = nitro.options._c12?.layers;
        // Without the config sources, Sentry cannot tell if the user disabled source maps.
        if (!layers || viteConfigPreventsSourceMaps || layers.some(layer => hasNitroSourceMapSetting(layer.config))) {
          return;
        }

        nitro.options.sourcemap = 'hidden';
        enabledSourceMaps = true;
        logDebug(debug, "Enabled source map generation for the Nitro server build with `nitro.sourcemap: 'hidden'`.");
      },
    },
  };
}

/**
 * Nitro reads the output of its services as plain code, so its source maps would end at that output. Loading the
 * service's source map with the code lets the bundler compose both maps to the original source files.
 */
export function makeComposeNitroServiceSourceMapsPlugin(): Plugin {
  return {
    name: 'sentry-tanstackstart-nitro-service-source-maps',
    apply: 'build',
    applyToEnvironment: environment => environment.name === NITRO_ENVIRONMENT,
    async load(id) {
      const serviceOutDirs = getNitroServiceOutDirs(this.environment.config);
      if (!serviceOutDirs.some(outDir => isInDirectory(id, outDir))) {
        return null;
      }

      try {
        const [code, map] = await Promise.all([readFile(id, 'utf8'), readFile(`${id}.map`, 'utf8')]);
        return { code, map };
      } catch {
        // A chunk without a source map: let Nitro load the code as usual.
        return null;
      }
    },
  };
}

/** The output directories of the environments that Nitro bundles again. Empty in a build without Nitro. */
export function getNitroServiceOutDirs(config: ResolvedConfig): string[] {
  if (!(NITRO_ENVIRONMENT in config.environments)) {
    return [];
  }

  return Object.entries(config.environments)
    .filter(([name, environment]) => name !== NITRO_ENVIRONMENT && environment.consumer === 'server')
    .map(([, environment]) => path.resolve(config.root, environment.build.outDir));
}

function isInDirectory(file: string, directory: string): boolean {
  const relativePath = path.relative(directory, file);
  return (
    relativePath !== '' &&
    relativePath !== '..' &&
    !relativePath.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relativePath)
  );
}

/** `output.sourcemap` of the bundler config overrides `build.sourcemap` in the build output. */
export function hasOutputSourceMapSetting(
  build: Pick<BuildEnvironmentOptions, 'rolldownOptions'> | undefined,
): boolean {
  return [build?.rolldownOptions?.output ?? []].flat().some(output => output.sourcemap !== undefined);
}

/** In a Nitro config, `output.sourcemap` of the bundler config overrides `sourcemap` in the build output. */
function hasNitroSourceMapSetting(config: NitroSourceMapConfig | null | undefined): boolean {
  return [config?.sourcemap, config?.rollupConfig?.output?.sourcemap, config?.rolldownConfig?.output?.sourcemap].some(
    setting => setting !== undefined,
  );
}

function logDebug(debug: boolean | undefined, message: string): void {
  if (debug) {
    // eslint-disable-next-line no-console
    console.log(`[Sentry] ${message}`);
  }
}
