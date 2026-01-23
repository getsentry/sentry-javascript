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
export async function handleBuildDoneHook(
  sentryModuleOptions: SentryNuxtModuleOptions,
  nuxt: Nuxt,
  shouldDeleteFilesFallback?: { client: boolean; server: boolean },
): Promise<void> {
  const debug = sentryModuleOptions.debug ?? false;
  if (debug) {
    // eslint-disable-next-line no-console
    console.log('[Sentry] Nuxt build ended. Starting to upload build-time info to Sentry (release, source maps)...');
  }

  let createSentryBuildPluginManager: typeof createSentryBuildPluginManagerType | undefined;
  try {
    const bundlerPluginCore = await import('@sentry/bundler-plugin-core');
    createSentryBuildPluginManager = bundlerPluginCore.createSentryBuildPluginManager;
  } catch (error) {
    debug &&
      // eslint-disable-next-line no-console
      console.warn('[Sentry] Could not load build manager package. Will not upload build-time info to Sentry.', error);
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

  const options = getPluginOptions(sentryModuleOptions, shouldDeleteFilesFallback, 'full');

  // eslint-disable-next-line deprecation/deprecation
  const sourceMapsUploadOptions = sentryModuleOptions.sourceMapsUploadOptions || {};
  const sourceMapsEnabled =
    sentryModuleOptions.sourcemaps?.disable === true
      ? false
      : sentryModuleOptions.sourcemaps?.disable === false
        ? true
        : // eslint-disable-next-line deprecation/deprecation
          (sourceMapsUploadOptions.enabled ?? true);

  if (sourceMapsEnabled) {
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
  }

  try {
    const sentryBuildPluginManager = createSentryBuildPluginManager(options, {
      buildTool: 'nuxt',
      loggerPrefix: '[Sentry Nuxt Module]',
    });

    await sentryBuildPluginManager.telemetry.emitBundlerPluginExecutionSignal();
    await sentryBuildPluginManager.createRelease();

    // eslint-disable-next-line no-console
    debug && console.log('[Sentry] Successfully uploaded release information.');

    if (!sourceMapsEnabled) {
      debug &&
        // eslint-disable-next-line no-console
        console.log('[Sentry] Source map upload is disabled. Skipping debugID injection and source map upload steps.');
    } else {
      await sentryBuildPluginManager.injectDebugIds([outputDir]);
      // eslint-disable-next-line no-console
      debug && console.log('[Sentry] Successfully injected Debug IDs.');

      // todo: rewriteSources seems to not be applied
      await sentryBuildPluginManager.uploadSourcemaps([outputDir], {
        // We don't want to prepare the artifacts because we injected Debug IDs manually before
        prepareArtifacts: false,
      });
      // eslint-disable-next-line no-console
      debug && console.log('[Sentry] Successfully uploaded source maps.');

      await sentryBuildPluginManager.deleteArtifacts();
      debug &&
        // eslint-disable-next-line no-console
        console.log(
          `[Sentry] Successfully deleted specified source map artifacts (${sentryModuleOptions.sourcemaps?.filesToDeleteAfterUpload ? '' : "based on Sentry's default "}\`filesToDeleteAfterUpload: [${options.sourcemaps?.filesToDeleteAfterUpload}\`]).`,
        );
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[Sentry] Error during Sentry's build-end hook: ", error);
  }
}
