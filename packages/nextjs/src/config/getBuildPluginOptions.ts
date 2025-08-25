import type { Options as SentryBuildPluginOptions } from '@sentry/bundler-plugin-core';
import * as path from 'path';
import type { SentryBuildOptions } from './types';

/**
 * Get Sentry Build Plugin options for the runAfterProductionCompile hook.
 */
export function getBuildPluginOptions({
  sentryBuildOptions,
  releaseName,
  distDirAbsPath,
}: {
  sentryBuildOptions: SentryBuildOptions;
  releaseName: string | undefined;
  distDirAbsPath: string;
}): SentryBuildPluginOptions {
  const sourcemapUploadAssets: string[] = [];
  const sourcemapUploadIgnore: string[] = [];

  const filesToDeleteAfterUpload: string[] = [];

  // We need to convert paths to posix because Glob patterns use `\` to escape
  // glob characters. This clashes with Windows path separators.
  // See: https://www.npmjs.com/package/glob
  const normalizedDistDirAbsPath = distDirAbsPath.replace(/\\/g, '/');

  sourcemapUploadAssets.push(
    path.posix.join(normalizedDistDirAbsPath, '**'), // Next.js build output
  );
  if (sentryBuildOptions.sourcemaps?.deleteSourcemapsAfterUpload) {
    filesToDeleteAfterUpload.push(
      path.posix.join(normalizedDistDirAbsPath, '**', '*.js.map'),
      path.posix.join(normalizedDistDirAbsPath, '**', '*.mjs.map'),
      path.posix.join(normalizedDistDirAbsPath, '**', '*.cjs.map'),
    );
  }

  return {
    authToken: sentryBuildOptions.authToken,
    headers: sentryBuildOptions.headers,
    org: sentryBuildOptions.org,
    project: sentryBuildOptions.project,
    telemetry: sentryBuildOptions.telemetry,
    debug: sentryBuildOptions.debug,
    errorHandler: sentryBuildOptions.errorHandler,
    reactComponentAnnotation: {
      ...sentryBuildOptions.reactComponentAnnotation,
      ...sentryBuildOptions.unstable_sentryWebpackPluginOptions?.reactComponentAnnotation,
    },
    silent: sentryBuildOptions.silent,
    url: sentryBuildOptions.sentryUrl,
    sourcemaps: {
      disable: sentryBuildOptions.sourcemaps?.disable,
      rewriteSources(source) {
        if (source.startsWith('webpack://_N_E/')) {
          return source.replace('webpack://_N_E/', '');
        } else if (source.startsWith('webpack://')) {
          return source.replace('webpack://', '');
        } else {
          return source;
        }
      },
      assets: sentryBuildOptions.sourcemaps?.assets ?? sourcemapUploadAssets,
      ignore: sentryBuildOptions.sourcemaps?.ignore ?? sourcemapUploadIgnore,
      filesToDeleteAfterUpload,
      ...sentryBuildOptions.unstable_sentryWebpackPluginOptions?.sourcemaps,
    },
    release:
      releaseName !== undefined
        ? {
            inject: false, // The webpack plugin's release injection breaks the `app` directory - we inject the release manually with the value injection loader instead.
            name: releaseName,
            create: sentryBuildOptions.release?.create,
            finalize: sentryBuildOptions.release?.finalize,
            dist: sentryBuildOptions.release?.dist,
            vcsRemote: sentryBuildOptions.release?.vcsRemote,
            setCommits: sentryBuildOptions.release?.setCommits,
            deploy: sentryBuildOptions.release?.deploy,
            ...sentryBuildOptions.unstable_sentryWebpackPluginOptions?.release,
          }
        : {
            inject: false,
            create: false,
            finalize: false,
          },
    bundleSizeOptimizations: {
      ...sentryBuildOptions.bundleSizeOptimizations,
    },
    _metaOptions: {
      loggerPrefixOverride: '[@sentry/nextjs]',
      telemetry: {
        metaFramework: 'nextjs',
      },
    },
    ...sentryBuildOptions.unstable_sentryWebpackPluginOptions,
  };
}
