import { type SentryRollupPluginOptions, sentryRollupPlugin } from '@sentry/rollup-plugin';
import { type SentryVitePluginOptions } from '@sentry/vite-plugin';
import type { Nitro, NitroConfig } from 'nitropack';
import type { SentryNitroOptions } from '../common/types';

/**
 * Whether the user enabled (true, 'hidden', 'inline') or disabled (false) source maps
 */
export type UserSourceMapSetting = 'enabled' | 'disabled' | 'unset' | undefined;

/** A valid source map setting */
export type SourceMapSetting = boolean | 'hidden' | 'inline';

/**
 *  Setup source maps for Sentry inside the Nuxt module during build time (in Vite for Nuxt and Rollup for Nitro).
 */
export function setupSourceMaps(nitro: Nitro, moduleOptions: SentryNitroOptions): void {
  const isDebug = moduleOptions.debug;

  // TODO(v11): remove deprecated options (also from SentryNuxtModuleOptions type)
  // eslint-disable-next-line deprecation/deprecation
  const sourceMapsUploadOptions = moduleOptions.sourceMapsUploadOptions || {};
  const sourceMapsEnabled =
    moduleOptions.sourcemaps?.disable === true
      ? false
      : moduleOptions.sourcemaps?.disable === false
        ? true // eslint-disable-next-line deprecation/deprecation
        : (sourceMapsUploadOptions.enabled ?? true);

  // In case we overwrite the source map settings, we default to deleting the files
  let shouldDeleteFilesFallback = true;

  nitro.hooks.hook('compiled', () => {
    if (sourceMapsEnabled && !nitro.options.dev) {
      // Changing this setting will propagate:
      // - for client to viteConfig.build.sourceMap
      // - for server to viteConfig.build.sourceMap and nitro.sourceMap
      // On server, nitro.rollupConfig.output.sourcemap remains unaffected from this change.

      // ONLY THIS nuxt.sourcemap.(server/client) setting is the one Sentry will eventually overwrite with 'hidden'
      const previousSourceMapSettings = changeNitroSourceMapSettings(nitro, moduleOptions);

      shouldDeleteFilesFallback = previousSourceMapSettings === 'unset';

      if (
        isDebug &&
        !moduleOptions.sourcemaps?.filesToDeleteAfterUpload &&
        // eslint-disable-next-line deprecation/deprecation
        !sourceMapsUploadOptions.sourcemaps?.filesToDeleteAfterUpload &&
        shouldDeleteFilesFallback
      ) {
        // eslint-disable-next-line no-console
        console.log(
          "[Sentry] As Sentry enabled `'hidden'` source maps, source maps will be automatically deleted after uploading them to Sentry.",
        );
      }
    }
  });

  nitro.hooks.hook('rollup:before', (nitroApp, rollupConfig) => {
    if (!sourceMapsEnabled || nitroApp.options.dev) {
      return;
    }

    if (!rollupConfig.plugins) {
      rollupConfig.plugins = [];
    } else if (!Array.isArray(rollupConfig.plugins)) {
      // `rollupConfig.plugins` can be a single plugin, so we want to put it into an array so that we can push our own plugin
      rollupConfig.plugins = [rollupConfig.plugins];
    }

    validateNitroSourceMapSettings(nitroApp.options, moduleOptions);

    if (isDebug) {
      // eslint-disable-next-line no-console
      console.log('[Sentry] Adding Sentry Rollup plugin to the server runtime.');
    }

    // Add Sentry plugin
    // Runs only on server-side (Nitro)
    rollupConfig.plugins.push(sentryRollupPlugin(getPluginOptions(moduleOptions, shouldDeleteFilesFallback)));
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
// eslint-disable-next-line complexity
export function getPluginOptions(
  moduleOptions: SentryNitroOptions,
  shouldDeleteFilesFallback?: boolean,
): SentryVitePluginOptions | SentryRollupPluginOptions {
  // todo(v11): This "eslint-disable" can be removed again once we remove deprecated options.
  // eslint-disable-next-line deprecation/deprecation
  const sourceMapsUploadOptions = moduleOptions.sourceMapsUploadOptions || {};

  const fallbackFilesToDelete = shouldDeleteFilesFallback
    ? ['.*/**/server/**/*.map', '.*/**/output/**/*.map', '.*/**/function/**/*.map']
    : [];

  // Check for filesToDeleteAfterUpload in new location first, then deprecated location
  const sourcemapsOptions = moduleOptions.sourcemaps || {};
  // eslint-disable-next-line deprecation/deprecation
  const deprecatedSourcemapsOptions = sourceMapsUploadOptions.sourcemaps || {};

  const filesToDeleteAfterUpload =
    sourcemapsOptions.filesToDeleteAfterUpload ??
    // eslint-disable-next-line deprecation/deprecation
    deprecatedSourcemapsOptions.filesToDeleteAfterUpload;

  if (typeof filesToDeleteAfterUpload === 'undefined' && shouldDeleteFilesFallback && moduleOptions.debug) {
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
        : shouldDeleteFilesFallback
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
export function getSourceMapSettings(nitro: Nitro): SourceMapSetting | undefined {
  return nitro.options.sourceMap;
}

/** only exported for testing  */
export function changeNitroSourceMapSettings(
  nitro: Nitro,
  sentryModuleOptions: SentryNitroOptions,
): UserSourceMapSetting {
  let previousUserSetting: UserSourceMapSetting;

  const nitroSourceMap = getSourceMapSettings(nitro);
  const isDebug = sentryModuleOptions.debug;

  if (
    typeof nitroSourceMap === 'string' ||
    typeof nitroSourceMap === 'boolean' ||
    typeof nitroSourceMap === 'undefined'
  ) {
    switch (nitroSourceMap) {
      case false:
        warnExplicitlyDisabledSourceMap('sourceMap', isDebug);
        previousUserSetting = 'disabled';
        break;

      case 'hidden':
      case true:
        logKeepEnabledSourceMapSetting(sentryModuleOptions, {
          key: 'sourceMap',
          value: nitroSourceMap,
        });
        previousUserSetting = 'enabled';
        break;
      case undefined:
        nitro.options.sourceMap = 'hidden';
        isDebug && logSentryEnablesSourceMap('sourceMap', 'hidden');
        previousUserSetting = 'unset';
        break;
    }
  } else {
    // TODO: Should we do something for client?

    if (nitroSourceMap === false) {
      warnExplicitlyDisabledSourceMap('sourceMap', isDebug);
      previousUserSetting = 'disabled';
    } else if (['hidden', true].includes(nitroSourceMap)) {
      logKeepEnabledSourceMapSetting(sentryModuleOptions, { key: 'sourceMap', value: nitroSourceMap });
      previousUserSetting = 'enabled';
    } else {
      nitro.options.sourceMap = 'hidden';
      isDebug && logSentryEnablesSourceMap('sourceMap', 'hidden');
      previousUserSetting = 'unset';
    }
  }

  return previousUserSetting;
}

/** Logs warnings about potentially conflicting source map settings.
 *  Configures `sourcemapExcludeSources` in Nitro to make source maps usable in Sentry.
 *
 * only exported for testing
 */
export function validateNitroSourceMapSettings(
  nitroConfig: NitroConfig,
  sentryModuleOptions: SentryNitroOptions,
): void {
  const isDebug = sentryModuleOptions.debug;

  // NITRO CONFIG ---

  // TODO: Frameworks using this could conflict with nitro, figure something out for them.

  // Check conflicts with rollup config
  const nitroSourceMap = nitroConfig.sourceMap;
  nitroConfig.rollupConfig = nitroConfig.rollupConfig || {};
  nitroConfig.rollupConfig.output = nitroConfig.rollupConfig.output || { sourcemap: undefined };
  const rollupSourceMap = nitroConfig.rollupConfig.output.sourcemap;

  if (
    typeof rollupSourceMap !== 'undefined' &&
    typeof nitroSourceMap !== 'undefined' &&
    ['hidden', 'inline', true, false].includes(nitroSourceMap)
  ) {
    validateDifferentSourceMapSettings(
      {
        key: 'sourceMap',
        value: nitroSourceMap,
      },
      {
        key: 'rollupConfig.output.sourcemap',
        value: rollupSourceMap,
      },
    );
  }

  nitroConfig.rollupConfig.output.sourcemapExcludeSources = false;
  if (isDebug) {
    // eslint-disable-next-line no-console
    console.log(
      '[Sentry] Set `sourcemapExcludeSources: false` in the Nuxt config (`nitro.rollupConfig.output`). Source maps will now include the actual code to be able to un-minify code snippets in Sentry.',
    );
  }
}

type SourceMapConfigEntry = {
  key: string;
  value: SourceMapSetting | undefined;
};

function validateDifferentSourceMapSettings(lhs: SourceMapConfigEntry, rhs: SourceMapConfigEntry): void {
  if (lhs.value !== rhs.value) {
    // eslint-disable-next-line no-console
    console.warn(
      `[Sentry] Source map generation settings are conflicting. Sentry uses \`${lhs.key}: ${lhs.value}\`. However, a conflicting setting was discovered (\`${rhs.key}: ${rhs.value}\`). This setting was probably explicitly set in your configuration. Sentry won't override this setting but it may affect source maps generation and upload. Without source maps, code snippets on the Sentry Issues page will remain minified.`,
    );
  }
}

function logKeepEnabledSourceMapSetting(moduleOptions: SentryNitroOptions, entry: SourceMapConfigEntry): void {
  if (moduleOptions.debug) {
    // eslint-disable-next-line no-console
    console.log(
      `[Sentry] \`${entry.key}\` is enabled with \`${entry.value}\`. This will correctly un-minify the code snippet on the Sentry Issue Details page.`,
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
