import type { SentryBuildOptions } from './types';
import { getWebpackBuildFunctionCalled } from './util';
import { createSentryBuildPluginManager } from '@sentry/bundler-plugin-core';
import { getBuildPluginOptions } from './webpackPluginOptions';
import { glob } from 'glob';

/**
 * A function to do Sentry stuff for the `afterProductionBuild` Next.js hook
 */
export async function handleAfterProductionBuild(
  buildInfo: { distDir: string; releaseName: string | undefined },
  sentryBuildOptions: SentryBuildOptions,
): Promise<void> {
  // The handleAfterProductionBuild function is only relevant if we are using Turbopack instead of Webpack, meaning we noop if we detect that we did any webpack logic
  if (getWebpackBuildFunctionCalled()) {
    if (sentryBuildOptions.debug) {
      // eslint-disable-next-line no-console
      console.debug('[@sentry/nextjs] Not running afterProductionBuild logic because Webpack context was ran.');
    }
    return;
  }

  const sentryBuildPluginManager = createSentryBuildPluginManager(
    getBuildPluginOptions(sentryBuildOptions, buildInfo.releaseName, 'after-production-build', buildInfo.distDir),
    {
      buildTool: 'turbopack',
      loggerPrefix: '[@sentry/nextjs]',
    },
  );

  const buildArtifactsPromise = glob(
    ['/**/*.js', '/**/*.mjs', '/**/*.cjs', '/**/*.js.map', '/**/*.mjs.map', '/**/*.cjs.map'].map(
      q => `${q}?(\\?*)?(#*)`,
    ), // We want to allow query and hashes strings at the end of files
    {
      root: buildInfo.distDir,
      absolute: true,
      nodir: true,
    },
  );

  await sentryBuildPluginManager.telemetry.emitBundlerPluginExecutionSignal();
  await sentryBuildPluginManager.createRelease();
  await sentryBuildPluginManager.uploadSourcemaps(await buildArtifactsPromise);
  await sentryBuildPluginManager.deleteArtifacts();
}
