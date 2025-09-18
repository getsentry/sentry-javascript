import type { Options as SentryBuildPluginOptions } from '@sentry/bundler-plugin-core';
import * as path from 'path';
import type { SentryBuildOptions } from './types';

/**
 * Get Sentry Build Plugin options for both webpack and turbopack builds.
 * These options can be used in two ways:
 * 1. The build can be done in a single operation after the production build completes
 * 2. The build can be done in multiple operations, one for each webpack build
 */
export function getBuildPluginOptions({
  sentryBuildOptions,
  releaseName,
  distDirAbsPath,
  buildTool,
  useRunAfterProductionCompileHook,
}: {
  sentryBuildOptions: SentryBuildOptions;
  releaseName: string | undefined;
  distDirAbsPath: string;
  buildTool:
    | 'webpack-client'
    | 'webpack-nodejs'
    | 'webpack-edge'
    | 'after-production-compile-webpack'
    | 'after-production-compile-turbopack';
  useRunAfterProductionCompileHook?: boolean; // Whether the user has opted into using the experimental hook
}): SentryBuildPluginOptions {
  const sourcemapUploadAssets: string[] = [];
  const sourcemapUploadIgnore: string[] = [];
  const filesToDeleteAfterUpload: string[] = [];

  // We need to convert paths to posix because Glob patterns use `\` to escape
  // glob characters. This clashes with Windows path separators.
  // See: https://www.npmjs.com/package/glob
  const normalizedDistDirAbsPath = distDirAbsPath.replace(/\\/g, '/');

  const loggerPrefix = {
    'webpack-nodejs': '[@sentry/nextjs - Node.js]',
    'webpack-edge': '[@sentry/nextjs - Edge]',
    'webpack-client': '[@sentry/nextjs - Client]',
    'after-production-compile-webpack': '[@sentry/nextjs - After Production Compile (Webpack)]',
    'after-production-compile-turbopack': '[@sentry/nextjs - After Production Compile (Turbopack)]',
  }[buildTool];

  if (buildTool.startsWith('after-production-compile')) {
    sourcemapUploadAssets.push(
      path.posix.join(normalizedDistDirAbsPath, 'server', '**'), // Standard output location for server builds
      path.posix.join(normalizedDistDirAbsPath, 'serverless', '**'), // Legacy output location for serverless Next.js
    );

    if (buildTool === 'after-production-compile-turbopack') {
      sourcemapUploadAssets.push(path.posix.join(normalizedDistDirAbsPath, 'static', 'chunks', '**'));
    } else {
      // Webpack client builds
      sourcemapUploadAssets.push(
        path.posix.join(normalizedDistDirAbsPath, 'static', 'chunks', 'pages', '**'),
        path.posix.join(normalizedDistDirAbsPath, 'static', 'chunks', 'app', '**'),
      );
    }

    if (sentryBuildOptions.sourcemaps?.deleteSourcemapsAfterUpload) {
      filesToDeleteAfterUpload.push(
        path.posix.join(normalizedDistDirAbsPath, '**', '*.js.map'),
        path.posix.join(normalizedDistDirAbsPath, '**', '*.mjs.map'),
        path.posix.join(normalizedDistDirAbsPath, '**', '*.cjs.map'),
      );
    }
  } else {
    if (buildTool === 'webpack-nodejs' || buildTool === 'webpack-edge') {
      // Webpack server builds
      sourcemapUploadAssets.push(
        path.posix.join(distDirAbsPath, 'server', '**'), // Standard output location for server builds
        path.posix.join(distDirAbsPath, 'serverless', '**'), // Legacy output location for serverless Next.js
      );
    } else {
      // Webpack client builds
      if (sentryBuildOptions.widenClientFileUpload) {
        sourcemapUploadAssets.push(path.posix.join(distDirAbsPath, 'static', 'chunks', '**'));
      } else {
        sourcemapUploadAssets.push(
          path.posix.join(distDirAbsPath, 'static', 'chunks', 'pages', '**'),
          path.posix.join(distDirAbsPath, 'static', 'chunks', 'app', '**'),
        );
      }

      // File deletion for webpack client builds
      // If the user has opted into using the experimental hook, we delete the source maps in the hook instead
      if (sentryBuildOptions.sourcemaps?.deleteSourcemapsAfterUpload && !useRunAfterProductionCompileHook) {
        filesToDeleteAfterUpload.push(
          // We only care to delete client bundle source maps because they would be the ones being served.
          // Removing the server source maps crashes Vercel builds for (thus far) unknown reasons:
          // https://github.com/getsentry/sentry-javascript/issues/13099
          path.posix.join(distDirAbsPath, 'static', '**', '*.js.map'),
          path.posix.join(distDirAbsPath, 'static', '**', '*.mjs.map'),
          path.posix.join(distDirAbsPath, 'static', '**', '*.cjs.map'),
        );
      }
    }
  }

  // We want to include main-* files if widenClientFileUpload is true as they have proven to be useful
  if (!sentryBuildOptions.widenClientFileUpload) {
    sourcemapUploadIgnore.push(path.posix.join(distDirAbsPath, 'static', 'chunks', 'main-*'));
  }

  // Always ignore framework, polyfills, and webpack files
  sourcemapUploadIgnore.push(
    path.posix.join(distDirAbsPath, 'static', 'chunks', 'framework-*'),
    path.posix.join(distDirAbsPath, 'static', 'chunks', 'framework.*'),
    path.posix.join(distDirAbsPath, 'static', 'chunks', 'polyfills-*'),
    path.posix.join(distDirAbsPath, 'static', 'chunks', 'webpack-*'),
  );

  // If the user has opted into using the experimental hook, we skip sourcemap uploads in the plugin
  const shouldSkipSourcemapsUpload = useRunAfterProductionCompileHook && buildTool.startsWith('webpack');

  return {
    authToken: sentryBuildOptions.authToken,
    headers: sentryBuildOptions.headers,
    org: sentryBuildOptions.org,
    project: sentryBuildOptions.project,
    telemetry: sentryBuildOptions.telemetry,
    debug: sentryBuildOptions.debug,
    errorHandler: sentryBuildOptions.errorHandler,
    reactComponentAnnotation: buildTool.startsWith('after-production-compile')
      ? undefined
      : {
          ...sentryBuildOptions.reactComponentAnnotation,
          ...sentryBuildOptions.unstable_sentryWebpackPluginOptions?.reactComponentAnnotation,
        },
    silent: sentryBuildOptions.silent,
    url: sentryBuildOptions.sentryUrl,
    sourcemaps: {
      disable: shouldSkipSourcemapsUpload ? true : (sentryBuildOptions.sourcemaps?.disable ?? false),
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
      filesToDeleteAfterUpload: filesToDeleteAfterUpload.length > 0 ? filesToDeleteAfterUpload : undefined,
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
      loggerPrefixOverride: loggerPrefix,
      telemetry: {
        metaFramework: 'nextjs',
      },
    },
    ...sentryBuildOptions.unstable_sentryWebpackPluginOptions,
  };
}
