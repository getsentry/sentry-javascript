import type { Nuxt } from '@nuxt/schema';
import { type SentryVitePluginOptions, sentryVitePlugin } from '@sentry/vite-plugin';
import type { SentryNuxtModuleOptions } from '../common/types';

/**
 * Whether the user enabled (true, 'hidden', 'inline') or disabled (false) source maps
 */
export type UserSourceMapSetting = 'enabled' | 'disabled' | 'unset' | undefined;

/** A valid source map setting */
export type SourceMapSetting = boolean | 'hidden' | 'inline';

/**
 *  Setup source maps for Sentry inside the Nuxt module during build time (in Vite for client-side only).
 *  Server-side source maps are handled by the Nitro SDK.
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
  let shouldDeleteClientFiles = true;

  nuxt.hook('modules:done', () => {
    if (sourceMapsEnabled && !nuxt.options.dev) {
      // Changing this setting will propagate to viteConfig.build.sourceMap for client
      // Server-side source maps are handled by Nitro SDK

      const previousClientSourceMapSetting = changeNuxtClientSourceMapSettings(nuxt, moduleOptions);

      shouldDeleteClientFiles = previousClientSourceMapSetting === 'unset';

      if (
        isDebug &&
        !moduleOptions.sourcemaps?.filesToDeleteAfterUpload &&
        // eslint-disable-next-line deprecation/deprecation
        !sourceMapsUploadOptions.sourcemaps?.filesToDeleteAfterUpload &&
        shouldDeleteClientFiles
      ) {
        // eslint-disable-next-line no-console
        console.log(
          "[Sentry] As Sentry enabled `'hidden'` source maps for the client, source maps will be automatically deleted after uploading them to Sentry.",
        );
      }
    }
  });

  nuxt.hook('vite:extendConfig', async (viteConfig, env) => {
    if (sourceMapsEnabled && viteConfig.mode !== 'development') {
      // Only handle client-side source maps; server-side is handled by Nitro SDK
      if (!env.isClient) {
        return;
      }

      const nuxtSourceMapSetting = extractNuxtSourceMapSetting(nuxt, 'client');

      viteConfig.build = viteConfig.build || {};
      const viteSourceMap = viteConfig.build.sourcemap;

      // Vite source map options are the same as the Nuxt source map config options (unless overwritten)
      validateDifferentSourceMapSettings({
        nuxtSettingKey: 'sourcemap.client',
        nuxtSettingValue: nuxtSourceMapSetting,
        otherSettingKey: 'viteConfig.build.sourcemap',
        otherSettingValue: viteSourceMap,
      });

      // Skip adding the Vite plugin if source maps are disabled
      // This prevents trying to upload source maps that won't be generated
      if (nuxtSourceMapSetting === false || viteSourceMap === false) {
        if (isDebug) {
          // eslint-disable-next-line no-console
          console.log('[Sentry] Skipping Sentry Vite plugin because client source maps are disabled.');
        }
        return;
      }

      if (isDebug) {
        // eslint-disable-next-line no-console
        console.log('[Sentry] Adding Sentry Vite plugin to the client runtime.');
      }

      // Add Sentry plugin
      // Vite plugin is added only on the client side; server-side source maps are handled by Nitro SDK's Rollup plugin
      viteConfig.plugins = viteConfig.plugins || [];
      viteConfig.plugins.push(sentryVitePlugin(getPluginOptions(moduleOptions, shouldDeleteClientFiles)));
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
 *  Generates source maps upload options for the Sentry Vite plugin (client-side only).
 *
 *  Only exported for Testing purposes.
 */
// todo(v11): This "eslint-disable" can be removed again once we remove deprecated options.
// eslint-disable-next-line complexity
export function getPluginOptions(
  moduleOptions: SentryNuxtModuleOptions,
  shouldDeleteClientFiles?: boolean,
): SentryVitePluginOptions {
  // eslint-disable-next-line deprecation/deprecation
  const sourceMapsUploadOptions = moduleOptions.sourceMapsUploadOptions || {};

  const fallbackFilesToDelete = shouldDeleteClientFiles ? ['.*/**/public/**/*.map'] : [];

  // Check for filesToDeleteAfterUpload in new location first, then deprecated location
  const sourcemapsOptions = moduleOptions.sourcemaps || {};
  // eslint-disable-next-line deprecation/deprecation
  const deprecatedSourcemapsOptions = sourceMapsUploadOptions.sourcemaps || {};

  const filesToDeleteAfterUpload =
    sourcemapsOptions.filesToDeleteAfterUpload ??
    // eslint-disable-next-line deprecation/deprecation
    deprecatedSourcemapsOptions.filesToDeleteAfterUpload;

  if (typeof filesToDeleteAfterUpload === 'undefined' && shouldDeleteClientFiles && moduleOptions.debug) {
    // eslint-disable-next-line no-console
    console.log(
      `[Sentry] Setting \`sentry.sourceMapsUploadOptions.sourcemaps.filesToDeleteAfterUpload: [${fallbackFilesToDelete
        // Logging it as strings in the array
        .map(path => `"${path}"`)
        .join(', ')}]\` to delete generated client source maps after they were uploaded to Sentry.`,
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
      // Client files are typically in '.output/public' but may vary by preset
      // eslint-disable-next-line deprecation/deprecation
      assets: sourcemapsOptions.assets ?? deprecatedSourcemapsOptions.assets ?? undefined,
      // eslint-disable-next-line deprecation/deprecation
      ignore: sourcemapsOptions.ignore ?? deprecatedSourcemapsOptions.ignore ?? undefined,
      filesToDeleteAfterUpload: filesToDeleteAfterUpload
        ? filesToDeleteAfterUpload
        : shouldDeleteClientFiles
          ? fallbackFilesToDelete
          : undefined,
      rewriteSources: (source: string) => normalizePath(source),
      ...moduleOptions?.unstable_sentryBundlerPluginOptions?.sourcemaps,
    },
  };
}

/*  There are multiple ways to set up client source maps (https://github.com/getsentry/sentry-javascript/issues/13993 and https://github.com/getsentry/sentry-javascript/pull/15859)
    1. User explicitly disabled source maps
      - keep this setting (emit a warning that errors won't be unminified in Sentry)
      - We will not upload anything
    2. users enabled source map generation (true, hidden, inline).
      - keep this setting (don't do anything - like deletion - besides uploading)
    3. users did not set source maps generation
      - we enable 'hidden' source maps generation
      - configure `filesToDeleteAfterUpload` to delete all .map files (we emit a log about this)

    Note: Server-side source maps are handled by the Nitro SDK.
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
export function changeNuxtClientSourceMapSettings(
  nuxt: Nuxt,
  sentryModuleOptions: SentryNuxtModuleOptions,
): UserSourceMapSetting {
  let previousClientSourceMapSetting: UserSourceMapSetting = undefined;

  const nuxtSourceMap = nuxt.options.sourcemap;
  const isDebug = sentryModuleOptions.debug;

  if (typeof nuxtSourceMap === 'string' || typeof nuxtSourceMap === 'boolean' || typeof nuxtSourceMap === 'undefined') {
    // If sourcemap is set globally, convert to object format and only modify client
    // Leave server as-is since Nitro SDK handles server-side source maps
    switch (nuxtSourceMap) {
      case false:
        warnExplicitlyDisabledSourceMap('sourcemap.client', isDebug);
        previousClientSourceMapSetting = 'disabled';
        // Keep server setting same as global, but warn about client
        nuxt.options.sourcemap = { client: false, server: false };
        break;

      case 'hidden':
      case true:
        logKeepEnabledSourceMapSetting(sentryModuleOptions, 'sourcemap.client', (nuxtSourceMap as true).toString());
        previousClientSourceMapSetting = 'enabled';
        // Keep server setting same as global
        nuxt.options.sourcemap = { client: nuxtSourceMap, server: nuxtSourceMap };
        break;
      case undefined:
        // Enable client source maps, server will be handled by Nitro SDK
        nuxt.options.sourcemap = { client: 'hidden', server: 'hidden' };
        if (isDebug) {
          logSentryEnablesSourceMap('sourcemap.client', 'hidden');
        }
        previousClientSourceMapSetting = 'unset';
        break;
    }
  } else {
    // Already in object format, only handle client
    // Make sure we have an object structure
    nuxt.options.sourcemap = nuxt.options.sourcemap ?? { server: undefined, client: undefined };

    if (nuxtSourceMap.client === false) {
      warnExplicitlyDisabledSourceMap('sourcemap.client', isDebug);
      previousClientSourceMapSetting = 'disabled';
    } else if (['hidden', true].includes(nuxtSourceMap.client)) {
      logKeepEnabledSourceMapSetting(sentryModuleOptions, 'sourcemap.client', nuxtSourceMap.client.toString());
      previousClientSourceMapSetting = 'enabled';
    } else {
      nuxt.options.sourcemap.client = 'hidden';
      if (isDebug) {
        logSentryEnablesSourceMap('sourcemap.client', 'hidden');
      }
      previousClientSourceMapSetting = 'unset';
    }
  }

  return previousClientSourceMapSetting;
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
