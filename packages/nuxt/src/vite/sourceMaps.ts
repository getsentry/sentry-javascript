import type { Nuxt } from '@nuxt/schema';
import { sentryRollupPlugin, type SentryRollupPluginOptions } from '@sentry/rollup-plugin';
import { sentryVitePlugin, type SentryVitePluginOptions } from '@sentry/vite-plugin';
import type { NitroConfig } from 'nitropack';
import type { SentryNuxtModuleOptions } from '../common/types';

/**
 * Whether the user enabled (true, 'hidden', 'inline') or disabled (false) source maps
 */
export type UserSourceMapSetting = 'enabled' | 'disabled' | 'unset' | undefined;

/** A valid source map setting */
export type SourceMapSetting = boolean | 'hidden' | 'inline';

/**
 *  Setup source maps for Sentry inside the Nuxt module during build time (in Vite for Nuxt and Rollup for Nitro).
 */
export function setupSourceMaps(moduleOptions: SentryNuxtModuleOptions, nuxt: Nuxt): void {
  // TODO(v11): remove deprecated options (also from SentryNuxtModuleOptions type)

  const isDebug = moduleOptions.debug;

  // eslint-disable-next-line deprecation/deprecation
  const sourceMapsUploadOptions = moduleOptions.sourceMapsUploadOptions || {};

  const sourceMapsEnabled =
    moduleOptions.sourcemaps?.disable === true
      ? false
      : moduleOptions.sourcemaps?.disable === false
        ? true
        : // eslint-disable-next-line deprecation/deprecation
          (sourceMapsUploadOptions.enabled ?? true);

  // In case we overwrite the source map settings, we default to deleting the files
  let shouldDeleteFilesFallback = { client: true, server: true };

  nuxt.hook('modules:done', () => {
    if (sourceMapsEnabled && !nuxt.options.dev && !nuxt.options?._prepare) {
      // Changing this setting will propagate:
      // - for client to viteConfig.build.sourceMap
      // - for server to viteConfig.build.sourceMap and nitro.sourceMap
      // On server, nitro.rollupConfig.output.sourcemap remains unaffected from this change.

      // ONLY THIS nuxt.sourcemap.(server/client) setting is the one Sentry will eventually overwrite with 'hidden'
      const previousSourceMapSettings = changeNuxtSourceMapSettings(nuxt, moduleOptions);

      shouldDeleteFilesFallback = {
        client: previousSourceMapSettings.client === 'unset',
        server: previousSourceMapSettings.server === 'unset',
      };

      if (isDebug && (shouldDeleteFilesFallback.client || shouldDeleteFilesFallback.server)) {
        const enabledDeleteFallbacks =
          shouldDeleteFilesFallback.client && shouldDeleteFilesFallback.server
            ? 'client-side and server-side'
            : shouldDeleteFilesFallback.server
              ? 'server-side'
              : 'client-side';

        if (
          !moduleOptions.sourcemaps?.filesToDeleteAfterUpload &&
          // eslint-disable-next-line deprecation/deprecation
          !sourceMapsUploadOptions.sourcemaps?.filesToDeleteAfterUpload
        ) {
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

  nuxt.hook('vite:extendConfig', async (viteConfig, env) => {
    if (sourceMapsEnabled && viteConfig.mode !== 'development' && !nuxt.options?._prepare) {
      const runtime = env.isServer ? 'server' : env.isClient ? 'client' : undefined;
      const nuxtSourceMapSetting = extractNuxtSourceMapSetting(nuxt, runtime);

      viteConfig.build = viteConfig.build || {};
      const viteSourceMap = viteConfig.build.sourcemap;

      // Vite source map options are the same as the Nuxt source map config options (unless overwritten)
      validateDifferentSourceMapSettings({
        nuxtSettingKey: `sourcemap.${runtime}`,
        nuxtSettingValue: nuxtSourceMapSetting,
        otherSettingKey: 'viteConfig.build.sourcemap',
        otherSettingValue: viteSourceMap,
      });

      if (isDebug) {
        if (!runtime) {
          // eslint-disable-next-line no-console
          console.log("[Sentry] Cannot detect runtime (client/server) inside hook 'vite:extendConfig'.");
        } else {
          // eslint-disable-next-line no-console
          console.log(`[Sentry] Adding Sentry Vite plugin to the ${runtime} runtime.`);
        }
      }

      // Add Sentry plugin
      // Vite plugin is added on the client and server side (hook runs twice)
      // Nuxt client source map is 'false' by default. Warning about this will be shown already in an earlier step, and it's also documented that `nuxt.sourcemap.client` needs to be enabled.
      viteConfig.plugins = viteConfig.plugins || [];
      viteConfig.plugins.push(sentryVitePlugin(getPluginOptions(moduleOptions, shouldDeleteFilesFallback)));
    }
  });

  nuxt.hook('nitro:config', (nitroConfig: NitroConfig) => {
    if (sourceMapsEnabled && !nitroConfig.dev && !nuxt.options?._prepare) {
      if (!nitroConfig.rollupConfig) {
        nitroConfig.rollupConfig = {};
      }

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
        sentryRollupPlugin(getPluginOptions(moduleOptions, shouldDeleteFilesFallback)),
      );
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
// todo(v11): This "eslint-disable" can be removed again once we remove deprecated options.
// eslint-disable-next-line complexity
export function getPluginOptions(
  moduleOptions: SentryNuxtModuleOptions,
  shouldDeleteFilesFallback?: { client: boolean; server: boolean },
): SentryVitePluginOptions | SentryRollupPluginOptions {
  // eslint-disable-next-line deprecation/deprecation
  const sourceMapsUploadOptions = moduleOptions.sourceMapsUploadOptions || {};

  const shouldDeleteFilesAfterUpload = shouldDeleteFilesFallback?.client || shouldDeleteFilesFallback?.server;
  const fallbackFilesToDelete = [
    ...(shouldDeleteFilesFallback?.client ? ['.*/**/public/**/*.map'] : []),
    ...(shouldDeleteFilesFallback?.server
      ? ['.*/**/server/**/*.map', '.*/**/output/**/*.map', '.*/**/function/**/*.map']
      : []),
  ];

  // Check for filesToDeleteAfterUpload in new location first, then deprecated location
  const sourcemapsOptions = moduleOptions.sourcemaps || {};
  // eslint-disable-next-line deprecation/deprecation
  const deprecatedSourcemapsOptions = sourceMapsUploadOptions.sourcemaps || {};

  const filesToDeleteAfterUpload =
    sourcemapsOptions.filesToDeleteAfterUpload ??
    // eslint-disable-next-line deprecation/deprecation
    deprecatedSourcemapsOptions.filesToDeleteAfterUpload;

  if (typeof filesToDeleteAfterUpload === 'undefined' && shouldDeleteFilesAfterUpload && moduleOptions.debug) {
    // eslint-disable-next-line no-console
    console.log(
      `[Sentry] Setting \`sentry.sourceMapsUploadOptions.sourcemaps.filesToDeleteAfterUpload: [${fallbackFilesToDelete
        // Logging it as strings in the array
        .map(path => `"${path}"`)
        .join(', ')}]\` to delete generated source maps after they were uploaded to Sentry.`,
    );
  }

  return {
    // eslint-disable-next-line deprecation/deprecation
    org: moduleOptions.org ?? sourceMapsUploadOptions.org ?? process.env.SENTRY_ORG,
    // eslint-disable-next-line deprecation/deprecation
    project: moduleOptions.project ?? sourceMapsUploadOptions.project ?? process.env.SENTRY_PROJECT,
    // eslint-disable-next-line deprecation/deprecation
    authToken: moduleOptions.authToken ?? sourceMapsUploadOptions.authToken ?? process.env.SENTRY_AUTH_TOKEN,
    // eslint-disable-next-line deprecation/deprecation
    telemetry: moduleOptions.telemetry ?? sourceMapsUploadOptions.telemetry ?? true,
    // eslint-disable-next-line deprecation/deprecation
    url: moduleOptions.sentryUrl ?? sourceMapsUploadOptions.url ?? process.env.SENTRY_URL,
    headers: moduleOptions.headers,
    debug: moduleOptions.debug ?? false,
    // eslint-disable-next-line deprecation/deprecation
    silent: moduleOptions.silent ?? sourceMapsUploadOptions.silent ?? false,
    // eslint-disable-next-line deprecation/deprecation
    errorHandler: moduleOptions.errorHandler ?? sourceMapsUploadOptions.errorHandler,
    bundleSizeOptimizations: moduleOptions.bundleSizeOptimizations, // todo: test if this can be overridden by the user
    release: {
      // eslint-disable-next-line deprecation/deprecation
      name: moduleOptions.release?.name ?? sourceMapsUploadOptions.release?.name,
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
      // eslint-disable-next-line deprecation/deprecation
      assets: sourcemapsOptions.assets ?? deprecatedSourcemapsOptions.assets ?? undefined,
      // eslint-disable-next-line deprecation/deprecation
      ignore: sourcemapsOptions.ignore ?? deprecatedSourcemapsOptions.ignore ?? undefined,
      filesToDeleteAfterUpload: filesToDeleteAfterUpload
        ? filesToDeleteAfterUpload
        : shouldDeleteFilesFallback?.server || shouldDeleteFilesFallback?.client
          ? fallbackFilesToDelete
          : undefined,
      rewriteSources: (source: string) => normalizePath(source),
      ...moduleOptions?.unstable_sentryBundlerPluginOptions?.sourcemaps,
    },
  };
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

function validateDifferentSourceMapSettings({
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
