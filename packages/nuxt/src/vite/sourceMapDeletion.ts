import { createSentryBuildPluginManager, type Options } from '@sentry/bundler-plugin-core';

export function withoutSourceMapDeletion(options: Options): Options {
  return {
    ...options,
    sourcemaps: {
      ...options.sourcemaps,
      filesToDeleteAfterUpload: undefined,
    },
  };
}

export async function deleteSourceMapsAfterBuild(options: Options): Promise<void> {
  const filesToDeleteAfterUpload = await options.sourcemaps?.filesToDeleteAfterUpload;

  if (filesToDeleteAfterUpload === undefined) {
    return;
  }

  const deletionOptions: Options = {
    ...options,
    sourcemaps: {
      ...options.sourcemaps,
      filesToDeleteAfterUpload,
    },
  };

  const sentryBuildPluginManager = createSentryBuildPluginManager(deletionOptions, {
    buildTool: 'nuxt',
    loggerPrefix: '[Sentry Nuxt]',
  });

  await sentryBuildPluginManager.deleteArtifacts();
}
