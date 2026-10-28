import { sentryVitePlugin } from '@sentry/bundler-plugins/vite';
import * as path from 'node:path';
import type { Plugin, ResolvedConfig, UserConfig } from 'vite';
import {
  getNitroServiceOutDirs,
  hasOutputSourceMapSetting,
  isNitroService,
  type PluginEnvironment,
  type SourceMapsEnablerApi,
} from './nitroSourceMaps';
import type { SentryTanstackStartOptions } from './sentryTanstackStart';

type FilesToDeleteAfterUpload = string | string[] | undefined;

/** TanStack Router and Start split route files into virtual modules, e.g. `index.tsx?tss-serverfn-split`. */
const TANSTACK_SPLIT_QUERY_REGEX = /\?ts[rs]-[^/]*$/;

/** Sources such as `virtual:#nitro/runtime` are no file paths. Two letters at least, so drive letters, like `C:`, are not matched by the regex. */
const SCHEME_REGEX = /^[a-z][a-z\d+.-]+:/i;

/**
 * Makes source paths relative to the project root and removes TanStack's split queries, so that client and server
 * frames show the path of the source file, such as `src/routes/index.tsx`.
 *
 * Paths in a source map are relative to the map's directory, which the default hook ignores.
 *
 * @internal Only exported for testing.
 */
export function rewriteTanstackStartSource(source: string, _map: unknown, context?: { mapDir: string }): string {
  const sourcePath = source.replace(TANSTACK_SPLIT_QUERY_REGEX, '');

  if (SCHEME_REGEX.test(sourcePath)) {
    return sourcePath;
  }

  const absolutePath = path.resolve(context?.mapDir ?? process.cwd(), sourcePath);
  return path.relative(process.cwd(), absolutePath).split(path.sep).join('/');
}

/**
 * A Sentry plugin for adding the @sentry/bundler-plugins/vite to automatically upload source maps to Sentry.
 */
export function makeAddSentryVitePlugin(options: SentryTanstackStartOptions): Plugin[] {
  const {
    applicationKey,
    authToken,
    bundleSizeOptimizations,
    debug,
    errorHandler,
    headers,
    moduleMetadata,
    org,
    project,
    release,
    sentryUrl,
    silent,
    sourcemaps,
    telemetry,
    reactComponentAnnotation,
  } = options;

  // defer resolving the filesToDeleteAfterUpload until we got access to the Vite config
  let resolveFilesToDeleteAfterUpload: ((value: FilesToDeleteAfterUpload) => void) | undefined;
  const filesToDeleteAfterUploadPromise = new Promise<FilesToDeleteAfterUpload>(resolve => {
    resolveFilesToDeleteAfterUpload = resolve;
  });

  const configPlugin: Plugin = {
    name: 'sentry-tanstackstart-files-to-delete-after-upload-plugin',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      if (sourcemaps?.filesToDeleteAfterUpload !== undefined) {
        resolveFilesToDeleteAfterUpload?.(sourcemaps.filesToDeleteAfterUpload);
        return;
      }

      if (!isVite8OrLater(this.meta.viteVersion)) {
        // eslint-disable-next-line no-console
        console.warn(
          `[Sentry] TanStack Start requires Vite 8 or later. With an older Vite, Sentry deletes the source maps it generated only in \`build.outDir\` of each environment, so source maps in other output directories can stay in the build output.`,
        );
      }

      const filesToDelete = getSentryEnabledSourceMapGlobs(config);
      if (debug) {
        // eslint-disable-next-line no-console
        console.log(
          filesToDelete.length > 0
            ? `[Sentry] Automatically setting \`sourcemaps.filesToDeleteAfterUpload: ${JSON.stringify(filesToDelete)}\` to delete generated source maps after they were uploaded to Sentry.`
            : '[Sentry] No source maps are deleted after the upload, because Sentry did not enable source map generation for this build.',
        );
      }
      resolveFilesToDeleteAfterUpload?.(filesToDelete);
    },
  };

  const sentryPlugins = sentryVitePlugin({
    applicationKey,
    authToken: authToken ?? process.env.SENTRY_AUTH_TOKEN,
    bundleSizeOptimizations: bundleSizeOptimizations ?? undefined,
    debug: debug ?? false,
    errorHandler,
    headers,
    moduleMetadata,
    org: org ?? process.env.SENTRY_ORG,
    project: project ?? process.env.SENTRY_PROJECT,
    release,
    silent,
    sourcemaps: {
      assets: sourcemaps?.assets,
      disable: sourcemaps?.disable,
      ignore: sourcemaps?.ignore,
      rewriteSources: sourcemaps?.rewriteSources ?? rewriteTanstackStartSource,
      resolveSourceMap: sourcemaps?.resolveSourceMap,
      filesToDeleteAfterUpload: filesToDeleteAfterUploadPromise,
    },
    reactComponentAnnotation: {
      enabled: reactComponentAnnotation?.enabled ?? undefined,
      ignoredComponents: reactComponentAnnotation?.ignoredComponents ?? undefined,
    },
    telemetry: telemetry ?? true,
    url: sentryUrl,
    _metaOptions: {
      telemetry: {
        metaFramework: 'tanstackstart-react',
      },
    },
  });

  // Nitro bundles the output of its services again. Debug IDs from a service would end up in Nitro's output and point
  // to the service's source maps instead of Nitro's.
  const scopedSentryPlugins = sentryPlugins.map(plugin => ({
    ...plugin,
    applyToEnvironment: (environment: PluginEnvironment) => !isNitroService(environment),
  }));

  return [configPlugin, ...scopedSentryPlugins];
}

/**
 * Globs for the source maps in the output directories that only have source maps because Sentry enabled them. A glob
 * such as `./**\/*.map` does not enter dot directories like `.output`, where Nitro puts the client build.
 */
function getSentryEnabledSourceMapGlobs(config: ResolvedConfig): string[] {
  const serviceOutDirs = getNitroServiceOutDirs(config);
  const outDirs = Object.entries(config.environments)
    .filter(([name]) => hasSentryEnabledSourceMaps(config, name))
    .filter(([, environment]) => !hasOutputSourceMapSetting(environment.build))
    .flatMap(([, environment]) => getOutputDirs(config.root, environment.build))
    .filter(outDir => !serviceOutDirs.includes(outDir));

  return [...new Set(outDirs)].map(outDir => {
    const relativeOutDir = path.relative(process.cwd(), outDir).split(path.sep).join('/');
    return `${relativeOutDir || '.'}/**/*.map`;
  });
}

/** `output.dir` takes precedence over `build.outDir`. Nitro sets only `output.dir` for its server build. */
function getOutputDirs(root: string, build: ResolvedConfig['environments'][string]['build']): string[] {
  // Vite 7 has no `rolldownOptions`.
  const outputs = [build.rolldownOptions?.output ?? {}].flat();
  return outputs.map(output => path.resolve(root, output.dir ?? build.outDir));
}

/** Vite tells plugins its version since Vite 7. */
function isVite8OrLater(viteVersion: string | undefined): boolean {
  return Number(viteVersion?.split('.')[0]) >= 8;
}

function hasSentryEnabledSourceMaps(config: ResolvedConfig, environmentName: string): boolean {
  return config.plugins.some(plugin =>
    (plugin.api as Partial<SourceMapsEnablerApi> | undefined)?.hasSentryEnabledSourceMaps?.(environmentName),
  );
}

/**
 * A Sentry plugin for TanStack Start React to enable "hidden" source maps if they are unset.
 */
export function makeEnableSourceMapsVitePlugin(options: SentryTanstackStartOptions): Plugin[] {
  let enabledSourceMaps = false;
  let environmentsWithSourceMapSetting: string[] = [];

  const api: SourceMapsEnablerApi = {
    hasSentryEnabledSourceMaps: environmentName =>
      enabledSourceMaps && !environmentsWithSourceMapSetting.includes(environmentName),
  };

  return [
    {
      name: 'sentry-tanstackstart-react-source-maps',
      apply: 'build',
      enforce: 'post',
      api,
      config(viteConfig) {
        const sourcemap = getUpdatedSourceMapSettings(viteConfig, options);
        enabledSourceMaps = sourcemap !== viteConfig.build?.sourcemap;
        // The setting of an environment overrides the top-level setting, e.g. `nitro/vite` sets it for its environments.
        environmentsWithSourceMapSetting = Object.entries(viteConfig.environments ?? {})
          .filter(([, environment]) => environment?.build?.sourcemap !== undefined)
          .map(([name]) => name);

        return { build: { sourcemap } };
      },
    },
  ];
}

/** There are 3 ways to set up source map generation (https://github.com/getsentry/sentry-javascript/issues/13993)
 *
 *     1. User explicitly disabled source maps
 *       - keep this setting (emit a warning that errors won't be unminified in Sentry)
 *       - We won't upload anything
 *
 *     2. Users enabled source map generation (true, 'hidden', 'inline') or set `build.rolldownOptions.output.sourcemap`.
 *       - keep this setting (don't do anything - like deletion - besides uploading)
 *
 *     3. Users didn't set source maps generation
 *       - we enable 'hidden' source maps generation
 *       - configure `filesToDeleteAfterUpload` to delete these .map files after the upload (we emit a log about this)
 *
 * @internal Only exported for testing.
 */
export function getUpdatedSourceMapSettings(
  viteConfig: UserConfig,
  sentryPluginOptions?: SentryTanstackStartOptions,
): boolean | 'inline' | 'hidden' | undefined {
  viteConfig.build = viteConfig.build || {};

  const viteUserSourceMapSetting = viteConfig.build?.sourcemap;
  const settingKey = 'vite.build.sourcemap';
  const debug = sentryPluginOptions?.debug;

  // Respect user source map setting if it is explicitly set
  if (viteUserSourceMapSetting === false) {
    if (debug) {
      // eslint-disable-next-line no-console
      console.warn(
        `[Sentry] Source map generation is currently disabled in your TanStack Start configuration (\`${settingKey}: false\`). Sentry won't override this setting. Without source maps, code snippets on the Sentry Issues page will remain minified.`,
      );
    } else {
      // eslint-disable-next-line no-console
      console.warn('[Sentry] Source map generation is disabled in your TanStack Start configuration.');
    }

    return viteUserSourceMapSetting;
  } else if (viteUserSourceMapSetting && ['hidden', 'inline', true].includes(viteUserSourceMapSetting)) {
    if (debug) {
      // eslint-disable-next-line no-console
      console.log(
        `[Sentry] We discovered \`${settingKey}\` is set to \`${viteUserSourceMapSetting.toString()}\`. Sentry will keep this source map setting.`,
      );
    }

    return viteUserSourceMapSetting;
  } else if (hasOutputSourceMapSetting(viteConfig.build)) {
    if (debug) {
      // eslint-disable-next-line no-console
      console.log(
        '[Sentry] We discovered `vite.build.rolldownOptions.output.sourcemap`, which overrides `vite.build.sourcemap`. Sentry will keep this source map setting.',
      );
    }

    return undefined;
  }

  // If the user did not specify a source map setting, we enable 'hidden' by default
  if (debug) {
    // eslint-disable-next-line no-console
    console.log(
      `[Sentry] Enabled source map generation in the build options with \`${settingKey}: 'hidden'\`. The source maps will be deleted after they were uploaded to Sentry.`,
    );
  }

  return 'hidden';
}
