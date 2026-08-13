import type { Nuxt } from '@nuxt/schema';
import { sentryRollupPlugin, type SentryRollupPluginOptions } from '@sentry/bundler-plugins/rollup';
import { sentryVitePlugin, type SentryVitePluginOptions } from '@sentry/bundler-plugins/vite';
import type { NitroConfig } from 'nitropack';
import type { Plugin } from 'vite';
import type { SentryNuxtModuleOptions } from '../common/types';
import { deleteSourceMapsAfterBuild, withoutSourceMapDeletion } from './sourceMapDeletion';
import { validateSourceMapsOptionsPlugin } from './sentryVitePlugin';

/**
 * Whether the user enabled (true, 'hidden', 'inline') or disabled (false) source maps
 */
export type UserSourceMapSetting = 'enabled' | 'disabled' | 'unset' | undefined;

/** A valid source map setting */
export type SourceMapSetting = boolean | 'hidden' | 'inline';

/**
 *  Setup source maps for Sentry inside the Nuxt module during build time (in Vite for Nuxt and Rollup for Nitro).
 */
export function setupSourceMaps(
  moduleOptions: SentryNuxtModuleOptions,
  nuxt: Nuxt,
  addVitePlugin: (plugin: Plugin[], options?: { dev?: boolean; build?: boolean }) => void,
): void {
  const isDebug = moduleOptions.debug;

  const sourceMapsEnabled = moduleOptions.sourcemaps?.disable !== true;

  // In case we overwrite the source map settings, we default to deleting the files
  const shouldDeleteFilesFallback = { client: true, server: true };

  nuxt.hook('modules:done', () => {
    if (sourceMapsEnabled && !nuxt.options.dev && !nuxt.options?._prepare) {
      // Changing this setting will propagate:
      // - for client to viteConfig.build.sourceMap
      // - for server to viteConfig.build.sourceMap and nitro.sourceMap
      // On server, nitro.rollupConfig.output.sourcemap remains unaffected from this change.

      // ONLY THIS nuxt.sourcemap.(server/client) setting is the one Sentry will overwrite with 'hidden', if needed.
      const previousSourceMapSettings = changeNuxtSourceMapSettings(nuxt, moduleOptions);

      // Mutate in place so the Vite plugin (which captured this object at registration time) sees the updated values
      shouldDeleteFilesFallback.client = previousSourceMapSettings.client === 'unset';
      shouldDeleteFilesFallback.server = previousSourceMapSettings.server === 'unset';

      if (isDebug && (shouldDeleteFilesFallback.client || shouldDeleteFilesFallback.server)) {
        const enabledDeleteFallbacks =
          shouldDeleteFilesFallback.client && shouldDeleteFilesFallback.server
            ? 'client-side and server-side'
            : shouldDeleteFilesFallback.server
              ? 'server-side'
              : 'client-side';

        if (!moduleOptions.sourcemaps?.filesToDeleteAfterUpload) {
          // eslint-disable-next-line no-console
          console.log(
            `[Sentry] We enabled \`'hidden'\` source maps for your ${enabledDeleteFallbacks} build. Source map files will be automatically deleted after uploading them to Sentry.`,
          );
        } else {
          // eslint-disable-next-line no-console
          console.log(
            `[Sentry] We enabled \`'hidden'\` source maps for your ${enabledDeleteFallbacks} build. Source map files will be deleted according to your \`sourcemaps.filesToDeleteAfterUpload\` configuration. To use automatic deletion instead, leave \`filesToDeleteAfterUpload\` empty.`,
          );
        }
      }
    }
  });

  if (sourceMapsEnabled && !nuxt.options.dev && !nuxt.options?._prepare) {
    addVitePlugin(
      [
        validateSourceMapsOptionsPlugin({ nuxt, moduleOptions, sourceMapsEnabled }),
        // Vite plugin is added on the client and server side (plugin runs for both builds)
        ...sentryVitePlugin(withoutSourceMapDeletion(getPluginOptions(moduleOptions, shouldDeleteFilesFallback))),
      ],
      { dev: false, build: true }, // Only add source map plugin during build
    );
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

      if (isDebug) {
        // eslint-disable-next-line no-console
        console.log('[Sentry] Adding Sentry Rollup plugin to the server runtime.');
      }

      // Add Sentry plugin
      // Runs only on server-side (Nitro)
      nitroConfig.rollupConfig.plugins.push(
        sentryRollupPlugin(withoutSourceMapDeletion(getPluginOptions(moduleOptions, shouldDeleteFilesFallback))),
      );
    }
  });

  nuxt.hook('close', async () => {
    if (sourceMapsEnabled && !nuxt.options.dev && !nuxt.options?._prepare) {
      await deleteSourceMapsAfterBuild(getPluginOptions(moduleOptions, shouldDeleteFilesFallback));
    }
  });
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
  shouldDeleteFilesFallback?: { client: boolean; server: boolean },
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
      ...moduleOptions?.unstable_sentryBundlerPluginOptions?.release,
    },
    _metaOptions: {
      telemetry: {
        metaFramework: 'nuxt',
      },
    },
    ...moduleOptions?.unstable_sentryBundlerPluginOptions,

    sourcemaps: {
      disable: moduleOptions.sourcemaps?.disable,
      // The server/client files are in different places depending on the nitro preset (e.g. '.output/server' or '.netlify/functions-internal/server')
      // We cannot determine automatically how the build folder looks like (depends on the preset), so we have to accept that source maps are uploaded multiple times (with the vitePlugin for Nuxt and the rollupPlugin for Nitro).
      // If we could know where the server/client assets are located, we could do something like this (based on the Nitro preset): isNitro ? ['./.output/server/**/*'] : ['./.output/public/**/*'],
      assets: sourcemapsOptions.assets ?? undefined,
      ignore: sourcemapsOptions.ignore ?? undefined,
      filesToDeleteAfterUpload,
      rewriteSources: sourcemapsOptions.rewriteSources ?? normalizePath,
      ...moduleOptions?.unstable_sentryBundlerPluginOptions?.sourcemaps,
    },
  };
}

/**
 * Determines which files to delete after upload. If the user set `filesToDeleteAfterUpload`, we use
 * that. Otherwise we only delete the source maps Sentry generated itself — i.e. the sides
 * (client/server) whose `sourcemap` setting resolved to `undefined`, where Sentry stepped in and
 * enabled `'hidden'`. Given Nuxt's default of `{ server: true, client: false }`, this isn't the
 * default case: it only kicks in when a side is left `undefined` (whole config or a single sub-key).
 * @see https://nuxt.com/docs/4.x/api/nuxt-config#sourcemap
 */
function resolveFilesToDeleteAfterUpload(
  moduleOptions: SentryNuxtModuleOptions,
  shouldDeleteFilesFallback?: { client: boolean; server: boolean },
): string | Array<string> | undefined {
  const shouldDeleteFilesAfterUpload = shouldDeleteFilesFallback?.client || shouldDeleteFilesFallback?.server;
  const fallbackFilesToDelete = [
    ...(shouldDeleteFilesFallback?.client ? ['.*/**/public/**/*.map'] : []),
    ...(shouldDeleteFilesFallback?.server
      ? ['.*/**/server/**/*.map', '.*/**/output/**/*.map', '.*/**/function/**/*.map']
      : []),
  ];

  const filesToDeleteAfterUpload = moduleOptions.sourcemaps?.filesToDeleteAfterUpload;

  if (typeof filesToDeleteAfterUpload === 'undefined' && shouldDeleteFilesAfterUpload && moduleOptions.debug) {
    // eslint-disable-next-line no-console
    console.log(
      `[Sentry] Setting \`sentry.sourcemaps.filesToDeleteAfterUpload: [${fallbackFilesToDelete
        // Logging it as strings in the array
        .map(path => `"${path}"`)
        .join(', ')}]\` to delete generated source maps after they were uploaded to Sentry.`,
    );
  }

  return filesToDeleteAfterUpload
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
      - we enable 'hidden' source maps generation
      - configure `filesToDeleteAfterUpload` to delete all .map files (we emit a log about this)

    Users only have to explicitly enable client source maps. Sentry only overwrites the base Nuxt source map settings as they propagate.
 */

/** only exported for tests */
export function extractNuxtSourceMapSetting(
  nuxt: { options: { sourcemap?: SourceMapSetting | { server?: SourceMapSetting; client?: SourceMapSetting } } },
  runtime: 'client' | 'server' | undefined,
): SourceMapSetting | undefined {
  if (!runtime) {
    return undefined;
  } else {
    return typeof nuxt.options?.sourcemap === 'boolean' || typeof nuxt.options?.sourcemap === 'string'
      ? nuxt.options.sourcemap
      : nuxt.options?.sourcemap?.[runtime];
  }
}

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
        nuxt.options.sourcemap = { server: 'hidden', client: 'hidden' };
        isDebug && logSentryEnablesSourceMap('sourcemap.client', 'hidden');
        isDebug && logSentryEnablesSourceMap('sourcemap.server', 'hidden');
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
      nuxt.options.sourcemap.client = 'hidden';
      isDebug && logSentryEnablesSourceMap('sourcemap.client', 'hidden');
      previousUserSourceMapSetting.client = 'unset';
    }

    if (nuxtSourceMap.server === false) {
      warnExplicitlyDisabledSourceMap('sourcemap.server', isDebug);
      previousUserSourceMapSetting.server = 'disabled';
    } else if (['hidden', true].includes(nuxtSourceMap.server)) {
      logKeepEnabledSourceMapSetting(sentryModuleOptions, 'sourcemap.server', nuxtSourceMap.server.toString());
      previousUserSourceMapSetting.server = 'enabled';
    } else {
      nuxt.options.sourcemap.server = 'hidden';
      isDebug && logSentryEnablesSourceMap('sourcemap.server', 'hidden');
      previousUserSourceMapSetting.server = 'unset';
    }
  }

  return previousUserSourceMapSetting;
}

/** Logs warnings about potentially conflicting source map settings.
 *  Configures `sourcemapExcludeSources` in Nitro to make source maps usable in Sentry.
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
  if (isDebug) {
    // eslint-disable-next-line no-console
    console.log(
      '[Sentry] Set `sourcemapExcludeSources: false` in the Nuxt config (`nitro.rollupConfig.output`). Source maps will now include the actual code to be able to un-minify code snippets in Sentry.',
    );
  }
}

/**
 * Validates that source map settings are consistent between Nuxt and Vite/Nitro configurations.
 * Logs a warning if conflicting settings are detected.
 *
 * @internal Only exported for testing.
 */
export function validateDifferentSourceMapSettings({
  nuxtSettingKey,
  nuxtSettingValue,
  otherSettingKey,
  otherSettingValue,
}: {
  nuxtSettingKey: string;
  nuxtSettingValue?: SourceMapSetting;
  otherSettingKey: string;
  otherSettingValue?: SourceMapSetting;
}): void {
  if (nuxtSettingValue !== otherSettingValue) {
    // eslint-disable-next-line no-console
    console.warn(
      `[Sentry] Source map generation settings are conflicting. Sentry uses \`${nuxtSettingKey}: ${nuxtSettingValue}\`. However, a conflicting setting was discovered (\`${otherSettingKey}: ${otherSettingValue}\`). This setting was probably explicitly set in your configuration. Sentry won't override this setting but it may affect source maps generation and upload. Without source maps, code snippets on the Sentry Issues page will remain minified.`,
    );
  }
}

function logKeepEnabledSourceMapSetting(
  sentryNuxtModuleOptions: SentryNuxtModuleOptions,
  settingKey: string,
  settingValue: string,
): void {
  if (sentryNuxtModuleOptions.debug) {
    // eslint-disable-next-line no-console
    console.log(
      `[Sentry] \`${settingKey}\` is enabled with \`${settingValue}\`. This will correctly un-minify the code snippet on the Sentry Issue Details page.`,
    );
  }
}

function warnExplicitlyDisabledSourceMap(settingKey: string, isDebug: boolean | undefined): void {
  if (isDebug) {
    // eslint-disable-next-line no-console
    console.warn(
      `[Sentry] Source map generation is currently disabled in your Vite configuration (\`${settingKey}: false \`). This setting is either a default setting or was explicitly set in your configuration. Sentry won't override this setting. Without source maps, code snippets on the Sentry Issues page will remain minified. To show unminified code, enable source maps in \`${settingKey}\` (e.g. by setting them to \`hidden\`).`,
    );
  } else {
    // eslint-disable-next-line no-console
    console.warn(`[Sentry] Source map generation (\`${settingKey}\`) is disabled in your Vite configuration.`);
  }
}

function logSentryEnablesSourceMap(settingKey: string, settingValue: string): void {
  // eslint-disable-next-line no-console
  console.log(`[Sentry] Enabled source map generation in the build options with \`${settingKey}: ${settingValue}\`.`);
}
