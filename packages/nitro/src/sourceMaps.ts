import type { Options } from '@sentry/bundler-plugin-core';
import { createSentryBuildPluginManager } from '@sentry/bundler-plugin-core';
import type { Nitro } from 'nitro/types';
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
