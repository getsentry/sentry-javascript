import type { createSentryBuildPluginManager as createSentryBuildPluginManagerType } from '@sentry/bundler-plugin-core';
import { loadModule } from '@sentry/core';
import { glob } from 'glob';
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

  const buildArtifacts = await glob(
    ['/**/*.js', '/**/*.mjs', '/**/*.cjs', '/**/*.js.map', '/**/*.mjs.map', '/**/*.cjs.map'].map(
      q => `${q}?(\\?*)?(#*)`, // We want to allow query and hashes strings at the end of files
    ),
    {
      root: distDir,
      absolute: true,
      nodir: true,
    },
  );

  await sentryBuildPluginManager.telemetry.emitBundlerPluginExecutionSignal();
  await sentryBuildPluginManager.createRelease();
  await sentryBuildPluginManager.injectDebugIds(buildArtifacts);
  await sentryBuildPluginManager.uploadSourcemaps(buildArtifacts);
  await sentryBuildPluginManager.deleteArtifacts();
}
