import * as path from 'path';
import { getSentryRelease } from '@sentry/node-experimental';
import type { SentryWebpackPluginOptions } from '@sentry/webpack-plugin';
import type { BuildContext, NextConfigObject, SentryBuildOptions } from './types';

/**
 * Combine default and user-provided SentryWebpackPlugin options, accounting for whether we're building server files or
 * client files.
 */
export function getWebpackPluginOptions(
  buildContext: BuildContext,
  sentryBuildOptions: SentryBuildOptions,
): SentryWebpackPluginOptions {
  const { buildId, isServer, config: userNextConfig, dir: projectDir, nextRuntime } = buildContext;

  const prefixInsert = !isServer ? 'Client' : nextRuntime === 'edge' ? 'Edge' : 'Node.js';

  const distDirAbsPath = path.join(projectDir, (userNextConfig as NextConfigObject).distDir || '.next'); // `.next` is the default directory

  let sourcemapUploadAssets: string[] = [];
  const sourcemapUploadIgnore: string[] = [];

  if (isServer) {
    sourcemapUploadAssets.push(
      path.join(distDirAbsPath, 'server', '**'), // This is normally where Next.js outputs things
      path.join(distDirAbsPath, 'serverless', '**'), // This was the output location for serverless Next.js
    );
  } else {
    if (sentryBuildOptions.widenClientFileUpload) {
      sourcemapUploadAssets.push(path.join(distDirAbsPath, 'static', 'chunks', '**'));
    } else {
      sourcemapUploadAssets.push(
        path.join(distDirAbsPath, 'static', 'chunks', 'pages', '**'),
        path.join(distDirAbsPath, 'static', 'chunks', 'app', '**'),
      );
    }

    // TODO: We should think about uploading these when `widenClientFileUpload` is `true`. They may be useful in some situations.
    sourcemapUploadIgnore.push(
      path.join(distDirAbsPath, 'static', 'chunks', 'framework-*'),
      path.join(distDirAbsPath, 'static', 'chunks', 'framework.*'),
      path.join(distDirAbsPath, 'static', 'chunks', 'main-*'),
      path.join(distDirAbsPath, 'static', 'chunks', 'polyfills-*'),
      path.join(distDirAbsPath, 'static', 'chunks', 'webpack-*'),
    );
  }

  if (sentryBuildOptions.sourcemaps?.disable) {
    sourcemapUploadAssets = [];
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
      // TODO: Add this functionality
      // filesToDeleteAfterUpload: sentryBuildOptions.sourcemaps?.deleteSourcemapsAfterUpload
      //   ? path.join(distDirAbsPath, '**', '*.js.map')
      //   : undefined,
      ...sentryBuildOptions.unstable_sentryWebpackPluginOptions?.sourcemaps,
    },
    release: {
      inject: false, // The webpack plugin's release injection breaks the `app` directory - we inject the release manually with the value injection loader instead.
      name: sentryBuildOptions.release?.name ?? getSentryRelease(buildId),
      create: sentryBuildOptions.release?.create,
      finalize: sentryBuildOptions.release?.finalize,
      dist: sentryBuildOptions.release?.dist,
      vcsRemote: sentryBuildOptions.release?.vcsRemote,
      setCommits: sentryBuildOptions.release?.setCommits,
      deploy: sentryBuildOptions.release?.deploy,
      ...sentryBuildOptions.unstable_sentryWebpackPluginOptions?.release,
    },
    _metaOptions: {
      loggerPrefixOverride: `[@sentry/nextjs - ${prefixInsert}]`,
    },
    ...sentryBuildOptions.unstable_sentryWebpackPluginOptions,
  };
}
