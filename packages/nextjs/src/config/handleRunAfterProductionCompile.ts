import type { createSentryBuildPluginManager as createSentryBuildPluginManagerType } from '@sentry/bundler-plugin-core';
import { loadModule } from '@sentry/core';
import { getBuildPluginOptions } from './getBuildPluginOptions';
import type { SentryBuildOptions } from './types';

/**
 * This function is called by Next.js after the production build is complete.
 * It is used to upload sourcemaps to Sentry.
 */
export async function handleRunAfterProductionCompile(
  {
    releaseName,
    distDir,
    buildTool,
    usesNativeDebugIds,
  }: { releaseName?: string; distDir: string; buildTool: 'webpack' | 'turbopack'; usesNativeDebugIds?: boolean },
  sentryBuildOptions: SentryBuildOptions,
): Promise<void> {
  if (sentryBuildOptions.debug) {
    // eslint-disable-next-line no-console
    console.debug('[@sentry/nextjs] Running runAfterProductionCompile logic.');
  }

  const { createSentryBuildPluginManager } =
    loadModule<{ createSentryBuildPluginManager: typeof createSentryBuildPluginManagerType }>(
      '@sentry/bundler-plugin-core',
      module,
    ) ?? {};

  if (!createSentryBuildPluginManager) {
    // eslint-disable-next-line no-console
    console.warn(
      '[@sentry/nextjs] Could not load build manager package. Will not run runAfterProductionCompile logic.',
    );
    return;
  }

  const options = getBuildPluginOptions({
    sentryBuildOptions,
    releaseName,
    distDirAbsPath: distDir,
    buildTool: `after-production-compile-${buildTool}`,
  });

  const sentryBuildPluginManager = createSentryBuildPluginManager(options, {
    buildTool,
    loggerPrefix: '[@sentry/nextjs - After Production Compile]',
  });

  await sentryBuildPluginManager.telemetry.emitBundlerPluginExecutionSignal();
  await sentryBuildPluginManager.createRelease();

  // Skip debug ID injection if sourcemaps are disabled which are only relevant for sourcemap correlation
  if (!usesNativeDebugIds && sentryBuildOptions.sourcemaps?.disable !== true) {
    await sentryBuildPluginManager.injectDebugIds([distDir]);
  }

  await sentryBuildPluginManager.uploadSourcemaps([distDir], {
    // We don't want to prepare the artifacts because we injected debug ids manually before
    prepareArtifacts: false,
  });
  await sentryBuildPluginManager.deleteArtifacts();
}
