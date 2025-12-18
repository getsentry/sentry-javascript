import { existsSync } from 'node:fs';
import type { Nuxt } from '@nuxt/schema';
import type { createSentryBuildPluginManager as createSentryBuildPluginManagerType } from '@sentry/bundler-plugin-core';
import * as path from 'path';
import type { SentryNuxtModuleOptions } from '../common/types';
import { getPluginOptions } from './sourceMaps';

/**
 * A build-end hook that handles Sentry release creation and source map uploads.
 * It creates a new Sentry release if configured, uploads source maps to Sentry,
 * and optionally deletes the source map files after upload.
 *
 * This runs after both Vite (Nuxt) and Rollup (Nitro) builds complete, ensuring
 * debug IDs are injected and source maps uploaded only once.
 */
// eslint-disable-next-line complexity
export async function handleBuildDoneHook(sentryModuleOptions: SentryNuxtModuleOptions, nuxt: Nuxt): Promise<void> {
  const debug = sentryModuleOptions.debug ?? false;
  if (debug) {
    // eslint-disable-next-line no-console
    console.log('[Sentry] Running build:done hook to upload source maps.');
  }

  // eslint-disable-next-line deprecation/deprecation
  const sourceMapsUploadOptions = sentryModuleOptions.sourceMapsUploadOptions || {};

  const sourceMapsEnabled =
    sentryModuleOptions.sourcemaps?.disable === true
      ? false
      : sentryModuleOptions.sourcemaps?.disable === false
        ? true
        : // eslint-disable-next-line deprecation/deprecation
          (sourceMapsUploadOptions.enabled ?? true);

  if (!sourceMapsEnabled) {
    return;
  }

  let createSentryBuildPluginManager: typeof createSentryBuildPluginManagerType | undefined;
  try {
    const bundlerPluginCore = await import('@sentry/bundler-plugin-core');
    createSentryBuildPluginManager = bundlerPluginCore.createSentryBuildPluginManager;
  } catch (error) {
    // eslint-disable-next-line no-console
    debug && console.warn('[Sentry] Could not load build manager package. Will not upload source maps.', error);
    return;
  }

  if (!createSentryBuildPluginManager) {
    // eslint-disable-next-line no-console
    debug && console.warn('[Sentry] Could not find createSentryBuildPluginManager in bundler plugin core.');
    return;
  }

  const outputDir = nuxt.options.nitro?.output?.dir || path.join(nuxt.options.rootDir, '.output');

  if (!existsSync(outputDir)) {
    // eslint-disable-next-line no-console
    debug && console.warn(`[Sentry] Output directory does not exist yet: ${outputDir}. Skipping source map upload.`);
    return;
  }

  const options = getPluginOptions(sentryModuleOptions, undefined);

  const existingIgnore = options.sourcemaps?.ignore || [];
  const ignorePatterns = Array.isArray(existingIgnore) ? existingIgnore : [existingIgnore];

  // node_modules source maps are ignored
  const nodeModulesPatterns = ['**/node_modules/**', '**/node_modules/**/*.map'];
  const hasNodeModulesIgnore = ignorePatterns.some(
    pattern => typeof pattern === 'string' && pattern.includes('node_modules'),
  );

  if (!hasNodeModulesIgnore) {
    ignorePatterns.push(...nodeModulesPatterns);
  }

  options.sourcemaps = {
    ...options.sourcemaps,
    ignore: ignorePatterns.length > 0 ? ignorePatterns : undefined,
  };

  if (debug && ignorePatterns.length > 0) {
    // eslint-disable-next-line no-console
    console.log(`[Sentry] Excluding patterns from source map upload: ${ignorePatterns.join(', ')}`);
  }

  try {
    const sentryBuildPluginManager = createSentryBuildPluginManager(options, {
      buildTool: 'nuxt',
      loggerPrefix: '[Sentry Nuxt Module]',
    });

    await sentryBuildPluginManager.telemetry.emitBundlerPluginExecutionSignal();
    await sentryBuildPluginManager.createRelease();
    await sentryBuildPluginManager.injectDebugIds([outputDir]);
    await sentryBuildPluginManager.uploadSourcemaps([outputDir], {
      prepareArtifacts: false,
    });

    await sentryBuildPluginManager.deleteArtifacts();

    // eslint-disable-next-line no-console
    debug && console.log('[Sentry] Successfully uploaded source maps.');
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[Sentry] Error during source map upload:', error);
  }
}
