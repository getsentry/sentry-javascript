import type { Options as BundlerPluginOptions } from '@sentry/bundler-plugin-core';
import { createSentryBuildPluginManager } from '@sentry/bundler-plugin-core';
import type { Nitro, NitroConfig } from 'nitro/types';
import type { SentryNitroOptions } from './config';

/**
 * Registers a `compiled` hook to upload source maps after the build completes.
 */
export function setupSourceMaps(nitro: Nitro, options?: SentryNitroOptions, sentryEnabledSourcemaps?: boolean): void {
  // The `compiled` hook fires on EVERY rebuild during `nitro dev` watch mode.
  // nitro.options.dev is reliably set by the time module setup runs.
  if (nitro.options.dev) {
    return;
  }

  // Nitro spawns a nested Nitro instance for prerendering with the user's `modules` re-installed.
  // Uploading here would double-upload source maps and create a duplicate release.
  if (nitro.options.preset === 'nitro-prerender') {
    return;
  }

  // Respect user's explicit disable
  if (options?.sourcemaps?.disable === true) {
    return;
  }

  nitro.hooks.hook('compiled', async (_nitro: Nitro) => {
    await handleSourceMapUpload(_nitro, options, sentryEnabledSourcemaps);
  });
}

/**
 * Handles the actual source map upload after the build completes.
 */
async function handleSourceMapUpload(
  nitro: Nitro,
  options?: SentryNitroOptions,
  sentryEnabledSourcemaps?: boolean,
): Promise<void> {
  const outputDir = nitro.options.output.serverDir;
  const pluginOptions = getPluginOptions(options, sentryEnabledSourcemaps);

  const sentryBuildPluginManager = createSentryBuildPluginManager(pluginOptions, {
    buildTool: 'nitro',
    loggerPrefix: '[@sentry/nitro]',
  });

  await sentryBuildPluginManager.telemetry.emitBundlerPluginExecutionSignal();
  await sentryBuildPluginManager.createRelease();

  await sentryBuildPluginManager.injectDebugIds([outputDir]);

  if (options?.sourcemaps?.disable !== 'disable-upload') {
    await sentryBuildPluginManager.uploadSourcemaps([outputDir], {
      // We don't prepare the artifacts because we injected debug IDs manually before
      prepareArtifacts: false,
    });
    await sentryBuildPluginManager.deleteArtifacts();
  }
}

/**
 * Normalizes the beginning of a path from e.g. ../../../ to ./
 */
function normalizePath(path: string): string {
  return path.replace(/^(\.\.\/)+/, './');
}

/**
 * Builds the plugin options for `createSentryBuildPluginManager` from the Sentry Nitro options.
 *
 * Only exported for testing purposes.
 */
export function getPluginOptions(
  options?: SentryNitroOptions,
  sentryEnabledSourcemaps?: boolean,
): BundlerPluginOptions {
  return {
    org: options?.org ?? process.env.SENTRY_ORG,
    project: options?.project ?? process.env.SENTRY_PROJECT,
    authToken: options?.authToken ?? process.env.SENTRY_AUTH_TOKEN,
    url: options?.sentryUrl ?? process.env.SENTRY_URL,
    headers: options?.headers,
    telemetry: options?.telemetry ?? true,
    debug: options?.debug ?? false,
    silent: options?.silent ?? false,
    errorHandler: options?.errorHandler,
    sourcemaps: {
      disable: options?.sourcemaps?.disable,
      assets: options?.sourcemaps?.assets,
      ignore: options?.sourcemaps?.ignore,
      filesToDeleteAfterUpload:
        options?.sourcemaps?.filesToDeleteAfterUpload ?? (sentryEnabledSourcemaps ? ['**/*.map'] : undefined),
      rewriteSources: options?.sourcemaps?.rewriteSources ?? ((source: string) => normalizePath(source)),
    },
    release: options?.release,
    bundleSizeOptimizations: options?.bundleSizeOptimizations,
    _metaOptions: {
      telemetry: {
        metaFramework: 'nitro',
      },
    },
  };
}

/*  Source map configuration rules:
    1. User explicitly disabled source maps (sourcemap: false)
      - Keep their setting, emit a warning that errors won't be unminified in Sentry
      - We will not upload anything
    2. User enabled source map generation (true)
      - Keep their setting (don't modify besides uploading)
    3. User did not set source maps (undefined)
      - We enable source maps for Sentry
      - Configure `filesToDeleteAfterUpload` to clean up .map files after upload
*/
export function configureSourcemapSettings(
  config: NitroConfig,
  moduleOptions?: SentryNitroOptions,
): { sentryEnabledSourcemaps: boolean } {
  const sourcemapUploadDisabled = moduleOptions?.sourcemaps?.disable === true;
  if (sourcemapUploadDisabled) {
    return { sentryEnabledSourcemaps: false };
  }

  if (config.sourcemap === false) {
    // eslint-disable-next-line no-console
    console.warn(
      '[@sentry/nitro] You have explicitly disabled source maps (`sourcemap: false`). Sentry will not upload source maps, and errors will not be unminified. To let Sentry handle source maps, remove the `sourcemap` option from your Nitro config, or use `sourcemaps: { disable: true }` in your Sentry options to silence this warning.',
    );
    return { sentryEnabledSourcemaps: false };
  }

  let sentryEnabledSourcemaps = false;
  if (config.sourcemap === true) {
    if (moduleOptions?.debug) {
      // eslint-disable-next-line no-console
      console.log('[@sentry/nitro] Source maps are already enabled. Sentry will upload them for error unminification.');
    }
  } else {
    // User did not explicitly set sourcemap — enable it for Sentry
    config.sourcemap = true;
    sentryEnabledSourcemaps = true;
    if (moduleOptions?.debug) {
      // eslint-disable-next-line no-console
      console.log(
        '[@sentry/nitro] Enabled source map generation for Sentry. Source map files will be deleted after upload.',
      );
    }
  }

  // Nitro v3 has a `sourcemapMinify` plugin that destructively deletes `sourcesContent`,
  // `x_google_ignoreList`, and clears `mappings` for any chunk containing `node_modules`.
  // This makes sourcemaps unusable for Sentry.
  config.experimental = config.experimental || {};
  config.experimental.sourcemapMinify = false;

  return { sentryEnabledSourcemaps };
}
