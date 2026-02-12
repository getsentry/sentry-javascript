import type { Options } from '@sentry/bundler-plugin-core';
import { createSentryBuildPluginManager } from '@sentry/bundler-plugin-core';
import { debug } from '@sentry/core';
import type { Nitro, NitroConfig } from 'nitro/types';
import type { SentryNitroOptions } from './config';

/**
 * Registers a `compiled` hook to upload source maps after the build completes.
 */
export function setupSourceMaps(nitro: Nitro, options?: SentryNitroOptions): void {
  // The `compiled` hook fires on EVERY rebuild during `nitro dev` watch mode.
  // nitro.options.dev is reliably set by the time module setup runs.
  if (nitro.options.dev) {
    return;
  }

  // Respect user's explicit disable
  if (options?.sourcemaps?.disable === true || options?.disable === true) {
    return;
  }

  nitro.hooks.hook('compiled', async (_nitro: Nitro) => {
    await handleSourceMapUpload(_nitro, options);
  });
}

/**
 * Handles the actual source map upload after the build completes.
 */
async function handleSourceMapUpload(nitro: Nitro, options?: SentryNitroOptions): Promise<void> {
  const outputDir = nitro.options.output.serverDir;
  const pluginOptions = getPluginOptions(options);

  const sentryBuildPluginManager = createSentryBuildPluginManager(pluginOptions, {
    buildTool: 'nitro',
    loggerPrefix: '[@sentry/nitro]',
  });

  await sentryBuildPluginManager.telemetry.emitBundlerPluginExecutionSignal();
  await sentryBuildPluginManager.createRelease();

  if (options?.sourcemaps?.disable !== 'disable-upload') {
    await sentryBuildPluginManager.injectDebugIds([outputDir]);
    await sentryBuildPluginManager.uploadSourcemaps([outputDir], {
      // We don't prepare the artifacts because we injected debug IDs manually before
      prepareArtifacts: false,
    });
  }

  await sentryBuildPluginManager.deleteArtifacts();
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
export function getPluginOptions(options?: SentryNitroOptions): Options {
  return {
    org: options?.org ?? process.env.SENTRY_ORG,
    project: options?.project ?? process.env.SENTRY_PROJECT,
    authToken: options?.authToken ?? process.env.SENTRY_AUTH_TOKEN,
    url: options?.url ?? process.env.SENTRY_URL,
    headers: options?.headers,
    telemetry: options?.telemetry ?? true,
    debug: options?.debug ?? false,
    silent: options?.silent ?? false,
    errorHandler: options?.errorHandler,
    sourcemaps: {
      disable: options?.sourcemaps?.disable,
      assets: options?.sourcemaps?.assets,
      ignore: options?.sourcemaps?.ignore,
      filesToDeleteAfterUpload: options?.sourcemaps?.filesToDeleteAfterUpload ?? ['**/*.map'],
      rewriteSources: (source: string) => normalizePath(source),
    },
    release: options?.release,
    bundleSizeOptimizations: options?.bundleSizeOptimizations,
    _metaOptions: {
      telemetry: {
        metaFramework: 'nitro',
      },
      ...options?._metaOptions,
    },
  };
}

/**
 * Configures the Nitro config to enable source map generation.
 */
export function configureSourcemapSettings(config: NitroConfig, moduleOptions?: SentryNitroOptions): void {
  const sourcemapUploadDisabled = moduleOptions?.sourcemaps?.disable === true || moduleOptions?.disable === true;
  if (sourcemapUploadDisabled) {
    return;
  }

  if (config.sourcemap === false) {
    debug.warn(
      '[Sentry] You have explicitly disabled source maps (`sourcemap: false`). Sentry is overriding this to `true` so that errors can be un-minified in Sentry. To disable Sentry source map uploads entirely, use `sourcemaps: { disable: true }` in your Sentry options instead.',
    );
  }

  config.sourcemap = true;

  // Nitro v3 has a `sourcemapMinify` plugin that destructively deletes `sourcesContent`,
  // `x_google_ignoreList`, and clears `mappings` for any chunk containing `node_modules`.
  // This makes sourcemaps unusable for Sentry.
  // FIXME: Not sure about this one, it works either way?
  config.experimental = config.experimental || {};
  config.experimental.sourcemapMinify = false;

  if (moduleOptions?.debug) {
    debug.log('[Sentry] Enabled source map generation and configured build settings for Sentry source map uploads.');
  }
}
