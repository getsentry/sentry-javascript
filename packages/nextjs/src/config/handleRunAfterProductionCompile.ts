import type { createSentryBuildPluginManager as createSentryBuildPluginManagerType } from '@sentry/bundler-plugin-core';
import { loadModule } from '@sentry/core';
import { getBuildPluginOptions } from './getBuildPluginOptions';
import type { SentryBuildOptions } from './types';

/**
 * This function is called by Next.js after the production build is complete.
 * It is used to upload sourcemaps to Sentry.
 */
export async function handleRunAfterProductionCompile(
  { releaseName, distDir, buildTool }: { releaseName?: string; distDir: string; buildTool: 'webpack' | 'turbopack' },
  sentryBuildOptions: SentryBuildOptions,
): Promise<void> {
  if (sentryBuildOptions.debug) {
    // eslint-disable-next-line no-console
    console.debug('[@sentry/nextjs] Running runAfterProductionCompile logic.');
  }

  // We don't want to do anything for webpack at this point because the plugin already handles this
  // TODO: Actually implement this for webpack as well
  if (buildTool === 'webpack') {
    return;
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

  const sentryBuildPluginManager = createSentryBuildPluginManager(
    getBuildPluginOptions({
      sentryBuildOptions,
      releaseName,
      distDirAbsPath: distDir,
    }),
    {
      buildTool,
      loggerPrefix: '[@sentry/nextjs]',
    },
  );

  await sentryBuildPluginManager.telemetry.emitBundlerPluginExecutionSignal();
  await sentryBuildPluginManager.createRelease();
  await sentryBuildPluginManager.injectDebugIds([distDir]);
  await sentryBuildPluginManager.uploadSourcemaps([distDir], {
    // We don't want to prepare the artifacts because we injected debug ids manually before
    prepareArtifacts: false,
  });
  await sentryBuildPluginManager.deleteArtifacts();
}
