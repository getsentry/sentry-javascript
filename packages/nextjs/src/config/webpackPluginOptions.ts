import * as path from 'path';
import type { SentryWebpackPluginOptions } from '@sentry/webpack-plugin';
import type { SentryBuildOptions } from './types';

/**
 * Combine default and user-provided SentryWebpackPlugin options, accounting for whether we're building server files or
 * client files.
 */
export function getBuildPluginOptions(
  sentryBuildOptions: SentryBuildOptions,
  releaseName: string | undefined,
  mode: 'webpack-nodejs' | 'webpack-edge' | 'webpack-client' | 'after-production-build',
  distDirAbsPath: string,
): SentryWebpackPluginOptions {
  const loggerPrefixOverride = {
    'webpack-nodejs': '[@sentry/nextjs - Node.js]',
    'webpack-edge': '[@sentry/nextjs - Edge]',
    'webpack-client': '[@sentry/nextjs - Client]',
    'after-production-build': '[@sentry/nextjs]',
  }[mode];

  const sourcemapUploadAssets: string[] = [];
  const sourcemapUploadIgnore: string[] = [];
  const filesToDeleteAfterUpload: string[] = [];

  if (mode === 'after-production-build') {
    sourcemapUploadAssets.push(
      path.posix.join(distDirAbsPath, '**'), // This is normally where Next.js outputs things
    );
    if (sentryBuildOptions.sourcemaps?.deleteSourcemapsAfterUpload) {
      filesToDeleteAfterUpload.push(
        path.posix.join(distDirAbsPath, '**', '*.js.map'),
        path.posix.join(distDirAbsPath, '**', '*.mjs.map'),
        path.posix.join(distDirAbsPath, '**', '*.cjs.map'),
      );
    }
  } else {
    if (mode === 'webpack-nodejs' || mode === 'webpack-edge') {
      sourcemapUploadAssets.push(
        path.posix.join(distDirAbsPath, 'server', '**'), // This is normally where Next.js outputs things
        path.posix.join(distDirAbsPath, 'serverless', '**'), // This was the output location for serverless Next.js
      );
    } else {
      if (sentryBuildOptions.widenClientFileUpload) {
        sourcemapUploadAssets.push(path.posix.join(distDirAbsPath, 'static', 'chunks', '**'));
      } else {
        sourcemapUploadAssets.push(
          path.posix.join(distDirAbsPath, 'static', 'chunks', 'pages', '**'),
          path.posix.join(distDirAbsPath, 'static', 'chunks', 'app', '**'),
        );
      }

      // TODO: We should think about uploading these when `widenClientFileUpload` is `true`. They may be useful in some situations.
      sourcemapUploadIgnore.push(
        path.posix.join(distDirAbsPath, 'static', 'chunks', 'framework-*'),
        path.posix.join(distDirAbsPath, 'static', 'chunks', 'framework.*'),
        path.posix.join(distDirAbsPath, 'static', 'chunks', 'main-*'),
        path.posix.join(distDirAbsPath, 'static', 'chunks', 'polyfills-*'),
        path.posix.join(distDirAbsPath, 'static', 'chunks', 'webpack-*'),
      );
    }

    if (sentryBuildOptions.sourcemaps?.deleteSourcemapsAfterUpload) {
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

  return {
    authToken: sentryBuildOptions.authToken,
    headers: sentryBuildOptions.headers,
    org: sentryBuildOptions.org,
    project: sentryBuildOptions.project,
    telemetry: sentryBuildOptions.telemetry,
    debug: sentryBuildOptions.debug,
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
      filesToDeleteAfterUpload: filesToDeleteAfterUpload,
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
      loggerPrefixOverride,
      telemetry: {
        metaFramework: 'nextjs',
      },
    },
    ...sentryBuildOptions.unstable_sentryWebpackPluginOptions,
  };
}
