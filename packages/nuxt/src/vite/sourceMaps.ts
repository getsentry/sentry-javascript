import type { Nuxt } from '@nuxt/schema';
import { resolveReleaseName } from '@sentry/bundler-plugins/core';
import { sentryRollupPlugin, type SentryRollupPluginOptions } from '@sentry/bundler-plugins/rollup';
import { sentryVitePlugin, type SentryVitePluginOptions } from '@sentry/bundler-plugins/vite';
import { resolveSourceMapsFeatures, warnOnRemovedBuildOptions } from '@sentry/core';
import type { NitroConfig } from 'nitropack';
import type { Plugin } from 'vite';
import type { SentryNuxtModuleOptions } from '../common/types';
import {
  applyNitroSourceMapSettings,
  deletePublicSourceMaps,
  deleteSourceMapsAfterBuild,
  type DeletionFallback,
  getFallbackFilesToDelete,
  isViteBuilder,
  logSentryEnabledSourceMaps,
  withClientSourceMapDeletion,
  withoutSourceMapDeletion,
} from './sourceMapDeletion';
import { validateSourceMapsOptionsPlugin } from './sentryVitePlugin';
import {
  extractNuxtSourceMapSetting,
  logKeepEnabledSourceMapSetting,
  logSentryEnablesSourceMap,
  sentryEnablesSourceMaps,
  type SourceMapSetting,
  validateDifferentSourceMapSettings,
  warnExplicitlyDisabledSourceMap,
} from './sourceMapSettings';

/**
 * Whether the user enabled (true, 'hidden', 'inline') or disabled (false) source maps
 */
export type UserSourceMapSetting = 'enabled' | 'disabled' | 'unset' | undefined;

type AddVitePluginOptions = { dev?: boolean; build?: boolean; server?: boolean; client?: boolean };

/** The public runtime config key that gives the release to the client SDK. */
export const NUXT_RELEASE_RUNTIME_CONFIG_KEY = '_sentryRelease';

/**
 *  Setup source maps for Sentry inside the Nuxt module during build time (in Vite for Nuxt and Rollup for Nitro).
 */
export function setupSourceMaps(
  moduleOptions: SentryNuxtModuleOptions,
  nuxt: Nuxt,
  addVitePlugin: (plugin: Plugin[], options?: AddVitePluginOptions) => void,
  hasClientConfigFile = false,
  viteServer = false,
): void {
  // Warn here rather than in `getPluginOptions`, which runs once per bundler (Vite and Nitro's
  // Rollup) and would emit the same warning twice.
  warnOnRemovedBuildOptions(moduleOptions, ['unstable_sentryBundlerPluginOptions']);

  const isDebug = moduleOptions.debug;

  // TODO(v12): Add the Sentry plugins with `sourcemaps.disable: true` too, like with the options that replace it.
  const sourceMapsEnabled = resolveSourceMapsFeatures(moduleOptions.sourcemaps).legacyDisable !== true;

  // In case we overwrite the source map settings, we default to deleting the files
  const shouldDeleteFilesFallback: DeletionFallback = { client: true, server: true };

  nuxt.hook('modules:done', () => {
    if (sourceMapsEnabled && !nuxt.options.dev && !nuxt.options?._prepare) {
      // Changing this setting will propagate:
      // - for client to viteConfig.build.sourceMap
      // - for server to viteConfig.build.sourceMap and nitro.sourceMap
      // On server, nitro.rollupConfig.output.sourcemap remains unaffected from this change.

      // ONLY THIS nuxt.sourcemap.(server/client) setting is the one Sentry will overwrite with 'hidden', if needed.
      const previousSourceMapSettings = changeNuxtSourceMapSettings(nuxt, moduleOptions);

      const sentryEnabled = sentryEnablesSourceMaps(moduleOptions);
      // Mutate in place so the Vite plugin (which captured this object at registration time) sees the updated values
      shouldDeleteFilesFallback.client = sentryEnabled && previousSourceMapSettings.client === 'unset';
      shouldDeleteFilesFallback.server = sentryEnabled && previousSourceMapSettings.server === 'unset';

      if (isDebug) {
        logSentryEnabledSourceMaps(shouldDeleteFilesFallback, moduleOptions.sourcemaps?.delete);
      }
    }
  });

  if (sourceMapsEnabled && !nuxt.options.dev && !nuxt.options?._prepare) {
    // Also on the SSR build: Nitro's source maps reach the original files only through that build's maps.
    addVitePlugin([validateSourceMapsOptionsPlugin({ nuxt, moduleOptions, sourceMapsEnabled })], {
      dev: false,
      build: true,
    });

    const clientPluginOptions = getPluginOptions(moduleOptions);
    addVitePlugin(
      sentryVitePlugin(
        withClientSourceMapDeletion(
          // Only the generated client config plugin reads the release from the runtime config.
          hasClientConfigFile
            ? moveClientReleaseToRuntimeConfig(nuxt, moduleOptions, clientPluginOptions)
            : clientPluginOptions,
          moduleOptions.sourcemaps,
          shouldDeleteFilesFallback,
        ),
      ),
      // Nitro bundles the SSR output again, so debug IDs from the SSR build would point to the wrong maps.
      { dev: false, build: true, server: false },
    );

    if (viteServer) {
      // The Vite server runs no Nitro, so its SSR output is final and no Rollup plugin uploads it. A plugin of
      // its own injects the release, which the client plugin leaves to the runtime config.
      addVitePlugin(
        sentryVitePlugin(
          withClientSourceMapDeletion(clientPluginOptions, moduleOptions.sourcemaps, shouldDeleteFilesFallback, true),
        ),
        { dev: false, build: true, client: false },
      );
    }
  }

  nuxt.hook('nitro:config', (nitroConfig: NitroConfig) => {
    if (sourceMapsEnabled && !nitroConfig.dev && !nuxt.options?._prepare) {
      nitroConfig.rollupConfig ??= {};

      if (nitroConfig.rollupConfig.plugins === null || nitroConfig.rollupConfig.plugins === undefined) {
        nitroConfig.rollupConfig.plugins = [];
      } else if (!Array.isArray(nitroConfig.rollupConfig.plugins)) {
        // `rollupConfig.plugins` can be a single plugin, so we want to put it into an array so that we can push our own plugin
        nitroConfig.rollupConfig.plugins = [nitroConfig.rollupConfig.plugins];
      }

      validateNitroSourceMapSettings(nuxt, nitroConfig, moduleOptions);
      applyNitroSourceMapSettings(nitroConfig, shouldDeleteFilesFallback, moduleOptions.sourcemaps?.delete);

      if (isDebug) {
        console.log('[Sentry] Adding Sentry Rollup plugin to the server runtime.');
      }

      // Add Sentry plugin
      // Runs only on server-side (Nitro)
      nitroConfig.rollupConfig.plugins.push(
        sentryRollupPlugin(withoutSourceMapDeletion(getPluginOptions(moduleOptions, shouldDeleteFilesFallback))),
      );
    }
  });

  nuxt.hook('nitro:init', nitro => {
    if (sourceMapsEnabled && !nitro.options.dev && !nuxt.options?._prepare) {
      const publicDir = nitro.options.output.publicDir;
      shouldDeleteFilesFallback.serverDir = nitro.options.output.serverDir;
      if (!isViteBuilder(nuxt)) {
        shouldDeleteFilesFallback.publicDir = publicDir;
      }
      const rollupConfig = (nitro.options.rollupConfig ??= { output: {} });

      rollupConfig.plugins = [
        rollupConfig.plugins,
        {
          name: 'sentry-nuxt-public-source-map-deletion',
          // By now the client build is in the public dir, and Nitro has not yet listed its files.
          async buildStart() {
            await deletePublicSourceMaps(getPluginOptions(moduleOptions, shouldDeleteFilesFallback), publicDir);
          },
        },
      ];
    }
  });

  nuxt.hook('close', async () => {
    if (sourceMapsEnabled && !nuxt.options.dev && !nuxt.options?._prepare) {
      await deleteSourceMapsAfterBuild(getPluginOptions(moduleOptions, shouldDeleteFilesFallback));
    }
  });
}

/**
 * The release usually changes on every commit. Injected into the client's startup chunks, it gives them, and every
 * chunk that imports them, new content hashes on every release. Nuxt serializes the public runtime config into the
 * page instead, from where the client config plugin hands it to the SDK.
 */
function moveClientReleaseToRuntimeConfig(
  nuxt: Nuxt,
  moduleOptions: SentryNuxtModuleOptions,
  pluginOptions: SentryVitePluginOptions,
): SentryVitePluginOptions {
  if (moduleOptions.release?.inject === false) {
    return pluginOptions;
  }

  const release = resolveReleaseName(moduleOptions.release?.name);
  if (release) {
    nuxt.options.runtimeConfig.public[NUXT_RELEASE_RUNTIME_CONFIG_KEY] = release;
  }

  // Pass the resolved name on so the plugin uploads under the same release the client reports.
  return { ...pluginOptions, release: { ...pluginOptions.release, ...(release && { name: release }), inject: false } };
}

/**
 * Normalizes the beginning of a path from e.g. ../../../ to ./
 */
function normalizePath(path: string): string {
  return path.replace(/^(\.\.\/)+/, './');
}

/**
 *  Generates source maps upload options for the Sentry Vite and Rollup plugin.
 *
 *  Only exported for Testing purposes.
 */
export function getPluginOptions(
  moduleOptions: SentryNuxtModuleOptions,
  shouldDeleteFilesFallback?: DeletionFallback,
): SentryVitePluginOptions | SentryRollupPluginOptions {
  const sourcemapsOptions = moduleOptions.sourcemaps || {};
  const filesToDeleteAfterUpload = resolveFilesToDeleteAfterUpload(moduleOptions, shouldDeleteFilesFallback);

  return {
    applicationKey: moduleOptions.applicationKey,
    org: moduleOptions.org ?? process.env.SENTRY_ORG,
    project: moduleOptions.project ?? process.env.SENTRY_PROJECT,
    authToken: moduleOptions.authToken ?? process.env.SENTRY_AUTH_TOKEN,
    telemetry: moduleOptions.telemetry ?? true,
    url: moduleOptions.sentryUrl ?? process.env.SENTRY_URL,
    headers: moduleOptions.headers,
    debug: moduleOptions.debug ?? false,
    silent: moduleOptions.silent ?? false,
    errorHandler: moduleOptions.errorHandler,
    bundleSizeOptimizations: moduleOptions.bundleSizeOptimizations, // todo: test if this can be overridden by the user
    release: {
      name: moduleOptions.release?.name,
      // Support all release options from BuildTimeOptionsBase
      ...moduleOptions.release,
    },
    moduleMetadata: moduleOptions.moduleMetadata,
    _metaOptions: {
      telemetry: {
        metaFramework: 'nuxt',
      },
    },

    sourcemaps: {
      disable: moduleOptions.sourcemaps?.disable,
      upload: sourcemapsOptions.upload,
      injectDebugIds: sourcemapsOptions.injectDebugIds,
      // `sourcemaps.delete` does not reach the plugins: `withClientSourceMapDeletion` and
      // `filesToDeleteAfterUpload` apply it, because Nitro still needs the maps of the SSR build.
      // The server/client files are in different places depending on the nitro preset (e.g. '.output/server' or '.netlify/functions-internal/server')
      // We cannot determine automatically how the build folder looks like (depends on the preset), so each plugin uploads its own build output (the vitePlugin for the Nuxt client and the rollupPlugin for Nitro).
      // If we could know where the server/client assets are located, we could do something like this (based on the Nitro preset): isNitro ? ['./.output/server/**/*'] : ['./.output/public/**/*'],
      assets: sourcemapsOptions.assets ?? undefined,
      ignore: sourcemapsOptions.ignore ?? undefined,
      filesToDeleteAfterUpload,
      rewriteSources: sourcemapsOptions.rewriteSources ?? normalizePath,
      resolveSourceMap: sourcemapsOptions.resolveSourceMap,
    },
  };
}

/**
 * Determines which files to delete after the build. If the user set `filesToDeleteAfterUpload`, we use
 * that. Otherwise we only delete the source maps Sentry generated itself, i.e. when the `sourcemap` setting
 * of a side resolved to `undefined` and Sentry enabled `'hidden'`. This covers the server maps, and the
 * client maps with a builder other than Vite. Sentry deletes them in Nitro's output directories, which are
 * only known once Nitro is set up.
 *
 * `sourcemaps.delete: true` deletes the source maps of both sides next to the user's files, and
 * `sourcemaps.delete: false` only the user's files.
 * @see https://nuxt.com/docs/4.x/api/nuxt-config#sourcemap
 */
function resolveFilesToDeleteAfterUpload(
  moduleOptions: SentryNuxtModuleOptions,
  shouldDeleteFilesFallback?: DeletionFallback,
): string | Array<string> | undefined {
  const deleteOption = moduleOptions.sourcemaps?.delete;
  const fallbackFilesToDelete = getFallbackFilesToDelete(shouldDeleteFilesFallback, deleteOption);
  const shouldDeleteFilesAfterUpload = fallbackFilesToDelete.length > 0;

  const filesToDeleteAfterUpload = moduleOptions.sourcemaps?.filesToDeleteAfterUpload;

  if (deleteOption === true) {
    const files = [...fallbackFilesToDelete, ...[filesToDeleteAfterUpload ?? []].flat()];
    return files.length > 0 ? files : undefined;
  }

  if (typeof filesToDeleteAfterUpload === 'undefined' && shouldDeleteFilesAfterUpload && moduleOptions.debug) {
    console.log(
      `[Sentry] Setting \`sentry.sourcemaps.filesToDeleteAfterUpload: [${fallbackFilesToDelete
        // Logging it as strings in the array
        .map(path => `"${path}"`)
        .join(', ')}]\` to delete generated source maps after they were uploaded to Sentry.`,
    );
  }

  return filesToDeleteAfterUpload !== undefined
    ? filesToDeleteAfterUpload
    : shouldDeleteFilesAfterUpload
      ? fallbackFilesToDelete
      : undefined;
}

/*  There are multiple ways to set up source maps (https://github.com/getsentry/sentry-javascript/issues/13993 and https://github.com/getsentry/sentry-javascript/pull/15859)
    1. User explicitly disabled source maps
      - keep this setting (emit a warning that errors won't be unminified in Sentry)
      - We will not upload anything
    2. users enabled source map generation (true, hidden, inline).
      - keep this setting (don't do anything - like deletion - besides uploading)
    3. users did not set source maps generation
      - we enable 'hidden' source maps generation when Sentry uploads the maps, or when `sourcemaps.delete: false`
        keeps them for a manual upload. Otherwise we leave it unset
      - client with the Vite builder: pass `deleteSourcemapsAfterUpload: true`, so the maps never reach the build output
      - client with another builder: configure `filesToDeleteAfterUpload` for the .map files in Nitro's public dir
      - server: configure `filesToDeleteAfterUpload` to delete the .map files after the build (we emit a log about this)

    Users only have to explicitly enable client source maps. Sentry only overwrites the base Nuxt source map settings as they propagate.
 */

/** only exported for testing  */
export function changeNuxtSourceMapSettings(
  nuxt: Nuxt,
  sentryModuleOptions: SentryNuxtModuleOptions,
): { client: UserSourceMapSetting; server: UserSourceMapSetting } {
  nuxt.options.sourcemap = nuxt.options.sourcemap ?? { server: undefined, client: undefined };

  let previousUserSourceMapSetting: { client: UserSourceMapSetting; server: UserSourceMapSetting } = {
    client: undefined,
    server: undefined,
  };

  const nuxtSourceMap = nuxt.options.sourcemap;
  const isDebug = sentryModuleOptions.debug;
  const sentryEnabled = sentryEnablesSourceMaps(sentryModuleOptions);

  if (typeof nuxtSourceMap === 'string' || typeof nuxtSourceMap === 'boolean' || typeof nuxtSourceMap === 'undefined') {
    switch (nuxtSourceMap) {
      case false:
        warnExplicitlyDisabledSourceMap('sourcemap', isDebug);
        previousUserSourceMapSetting = { client: 'disabled', server: 'disabled' };
        break;

      case 'hidden':
      case true:
        logKeepEnabledSourceMapSetting(sentryModuleOptions, 'sourcemap', (nuxtSourceMap as true).toString());
        previousUserSourceMapSetting = { client: 'enabled', server: 'enabled' };
        break;
      case undefined:
        if (sentryEnabled) {
          nuxt.options.sourcemap = { server: 'hidden', client: 'hidden' };
          isDebug && logSentryEnablesSourceMap('sourcemap.client', 'hidden');
          isDebug && logSentryEnablesSourceMap('sourcemap.server', 'hidden');
        }
        previousUserSourceMapSetting = { client: 'unset', server: 'unset' };
        break;
    }
  } else {
    if (nuxtSourceMap.client === false) {
      warnExplicitlyDisabledSourceMap('sourcemap.client', isDebug);
      previousUserSourceMapSetting.client = 'disabled';
    } else if (['hidden', true].includes(nuxtSourceMap.client)) {
      logKeepEnabledSourceMapSetting(sentryModuleOptions, 'sourcemap.client', nuxtSourceMap.client.toString());
      previousUserSourceMapSetting.client = 'enabled';
    } else {
      if (sentryEnabled) {
        nuxt.options.sourcemap.client = 'hidden';
        isDebug && logSentryEnablesSourceMap('sourcemap.client', 'hidden');
      }
      previousUserSourceMapSetting.client = 'unset';
    }

    if (nuxtSourceMap.server === false) {
      warnExplicitlyDisabledSourceMap('sourcemap.server', isDebug);
      previousUserSourceMapSetting.server = 'disabled';
    } else if (['hidden', true].includes(nuxtSourceMap.server)) {
      logKeepEnabledSourceMapSetting(sentryModuleOptions, 'sourcemap.server', nuxtSourceMap.server.toString());
      previousUserSourceMapSetting.server = 'enabled';
    } else {
      if (sentryEnabled) {
        nuxt.options.sourcemap.server = 'hidden';
        isDebug && logSentryEnablesSourceMap('sourcemap.server', 'hidden');
      }
      previousUserSourceMapSetting.server = 'unset';
    }
  }

  return previousUserSourceMapSetting;
}

/** Logs warnings about potentially conflicting source map settings.
 *  Configures `sourcemapExcludeSources` and `sourcemapMinify` in Nitro to make source maps usable in Sentry.
 *
 * only exported for testing
 */
export function validateNitroSourceMapSettings(
  nuxt: { options: { sourcemap?: SourceMapSetting | { server?: SourceMapSetting } } },
  nitroConfig: NitroConfig,
  sentryModuleOptions: SentryNuxtModuleOptions,
): void {
  const isDebug = sentryModuleOptions.debug;
  const nuxtSourceMap = extractNuxtSourceMapSetting(nuxt, 'server');

  // NITRO CONFIG ---

  validateDifferentSourceMapSettings({
    nuxtSettingKey: 'sourcemap.server',
    nuxtSettingValue: nuxtSourceMap,
    otherSettingKey: 'nitro.sourceMap',
    otherSettingValue: nitroConfig.sourceMap,
  });

  // ROLLUP CONFIG ---

  nitroConfig.rollupConfig = nitroConfig.rollupConfig || {};
  nitroConfig.rollupConfig.output = nitroConfig.rollupConfig.output || { sourcemap: undefined };
  const nitroRollupSourceMap = nitroConfig.rollupConfig.output.sourcemap;

  // We don't override nitro.rollupConfig.output.sourcemap (undefined by default, but overrides all other server-side source map settings)
  if (typeof nitroRollupSourceMap !== 'undefined' && ['hidden', 'inline', true, false].includes(nitroRollupSourceMap)) {
    const settingKey = 'nitro.rollupConfig.output.sourcemap';

    validateDifferentSourceMapSettings({
      nuxtSettingKey: 'sourcemap.server',
      nuxtSettingValue: nuxtSourceMap,
      otherSettingKey: settingKey,
      otherSettingValue: nitroRollupSourceMap,
    });
  }

  nitroConfig.rollupConfig.output.sourcemapExcludeSources = false;
  // Nitro's source map minification runs after the bundler wrote the maps: it clears `mappings` of maps with
  // `node_modules` sources, and Nitro 3 also deletes `sourcesContent`, which overrides `sourcemapExcludeSources`.
  nitroConfig.experimental = { ...nitroConfig.experimental, sourcemapMinify: false };
  if (isDebug) {
    console.log(
      '[Sentry] Set `sourcemapExcludeSources: false` (`nitro.rollupConfig.output`) and `sourcemapMinify: false` (`nitro.experimental`) in the Nuxt config. Source maps will now include the actual code to be able to un-minify code snippets in Sentry.',
    );
  }
}
