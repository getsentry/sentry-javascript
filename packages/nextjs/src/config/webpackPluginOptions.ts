import * as path from 'path';
import type { SentryWebpackPluginOptions } from '@sentry/webpack-plugin';
import type { BuildContext, NextConfigObject, SentryBuildOptions } from './types';

/**
 * Combine default and user-provided SentryWebpackPlugin options, accounting for whether we're building server files or
 * client files.
 */
export function getWebpackPluginOptions(
  buildContext: BuildContext,
  sentryBuildOptions: SentryBuildOptions,
  releaseName: string | undefined,
): SentryWebpackPluginOptions {
  const { isServer, config: userNextConfig, dir, nextRuntime } = buildContext;

  const prefixInsert = !isServer ? 'Client' : nextRuntime === 'edge' ? 'Edge' : 'Node.js';

  // We need to convert paths to posix because Glob patterns use `\` to escape
  // glob characters. This clashes with Windows path separators.
  // See: https://www.npmjs.com/package/glob
  const projectDir = dir.replace(/\\/g, '/');
  // `.next` is the default directory
  const distDir = (userNextConfig as NextConfigObject).distDir?.replace(/\\/g, '/') ?? '.next';
  const distDirAbsPath = path.posix.join(projectDir, distDir);

  const sourcemapUploadAssets: string[] = [];
  const sourcemapUploadIgnore: string[] = [];

  if (isServer) {
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
      filesToDeleteAfterUpload: sentryBuildOptions.sourcemaps?.deleteSourcemapsAfterUpload
        ? [
            // We only care to delete client bundle source maps because they would be the ones being served.
            // Removing the server source maps crashes Vercel builds for (thus far) unknown reasons:
            // https://github.com/getsentry/sentry-javascript/issues/13099
            path.posix.join(distDirAbsPath, 'static', '**', '*.js.map'),
            path.posix.join(distDirAbsPath, 'static', '**', '*.mjs.map'),
            path.posix.join(distDirAbsPath, 'static', '**', '*.cjs.map'),
          ]
        : undefined,
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
      loggerPrefixOverride: `[@sentry/nextjs - ${prefixInsert}]`,
      telemetry: {
        metaFramework: 'nextjs',
      },
    },
    ...sentryBuildOptions.unstable_sentryWebpackPluginOptions,
  };
}
