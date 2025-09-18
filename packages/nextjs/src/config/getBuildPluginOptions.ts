import type { Options as SentryBuildPluginOptions } from '@sentry/bundler-plugin-core';
import * as path from 'path';
import type { SentryBuildOptions } from './types';

const LOGGER_PREFIXES = {
  'webpack-nodejs': '[@sentry/nextjs - Node.js]',
  'webpack-edge': '[@sentry/nextjs - Edge]',
  'webpack-client': '[@sentry/nextjs - Client]',
  'after-production-compile-webpack': '[@sentry/nextjs - After Production Compile (Webpack)]',
  'after-production-compile-turbopack': '[@sentry/nextjs - After Production Compile (Turbopack)]',
} as const;

// File patterns for source map operations
const FILE_PATTERNS = {
  SERVER: 'server/**',
  SERVERLESS: 'serverless/**',
  STATIC_CHUNKS: 'static/chunks/**',
  STATIC_CHUNKS_PAGES: 'static/chunks/pages/**',
  STATIC_CHUNKS_APP: 'static/chunks/app/**',
  MAIN_CHUNKS: 'static/chunks/main-*',
  FRAMEWORK_CHUNKS: 'static/chunks/framework-*',
  FRAMEWORK_CHUNKS_DOT: 'static/chunks/framework.*',
  POLYFILLS_CHUNKS: 'static/chunks/polyfills-*',
  WEBPACK_CHUNKS: 'static/chunks/webpack-*',
} as const;

// Source map file extensions to delete
const SOURCEMAP_EXTENSIONS = ['*.js.map', '*.mjs.map', '*.cjs.map'] as const;

type BuildTool = keyof typeof LOGGER_PREFIXES;

/**
 * Normalizes Windows paths to POSIX format for glob patterns
 */
function normalizePathForGlob(distPath: string): string {
  return distPath.replace(/\\/g, '/');
}

/**
 * Creates file patterns for source map uploads based on build tool and options
 */
function createSourcemapUploadAssets(
  normalizedDistPath: string,
  buildTool: BuildTool,
  widenClientFileUpload: boolean = false,
): string[] {
  const assets: string[] = [];

  if (buildTool.startsWith('after-production-compile')) {
    assets.push(
      path.posix.join(normalizedDistPath, FILE_PATTERNS.SERVER),
      path.posix.join(normalizedDistPath, FILE_PATTERNS.SERVERLESS),
    );

    if (buildTool === 'after-production-compile-turbopack') {
      assets.push(path.posix.join(normalizedDistPath, FILE_PATTERNS.STATIC_CHUNKS));
    } else {
      // Webpack client builds in after-production-compile mode
      if (widenClientFileUpload) {
        assets.push(path.posix.join(normalizedDistPath, FILE_PATTERNS.STATIC_CHUNKS));
      } else {
        assets.push(
          path.posix.join(normalizedDistPath, FILE_PATTERNS.STATIC_CHUNKS_PAGES),
          path.posix.join(normalizedDistPath, FILE_PATTERNS.STATIC_CHUNKS_APP),
        );
      }
    }
  } else {
    if (buildTool === 'webpack-nodejs' || buildTool === 'webpack-edge') {
      // Server builds
      assets.push(
        path.posix.join(normalizedDistPath, FILE_PATTERNS.SERVER),
        path.posix.join(normalizedDistPath, FILE_PATTERNS.SERVERLESS),
      );
    } else {
      // Client builds
      if (widenClientFileUpload) {
        assets.push(path.posix.join(normalizedDistPath, FILE_PATTERNS.STATIC_CHUNKS));
      } else {
        assets.push(
          path.posix.join(normalizedDistPath, FILE_PATTERNS.STATIC_CHUNKS_PAGES),
          path.posix.join(normalizedDistPath, FILE_PATTERNS.STATIC_CHUNKS_APP),
        );
      }
    }
  }

  return assets;
}

/**
 * Creates ignore patterns for source map uploads
 */
function createSourcemapUploadIgnore(normalizedDistPath: string, widenClientFileUpload: boolean = false): string[] {
  const ignore: string[] = [];

  // We only add main-* files if the user has not opted into it
  if (!widenClientFileUpload) {
    ignore.push(path.posix.join(normalizedDistPath, FILE_PATTERNS.MAIN_CHUNKS));
  }

  // Always ignore these patterns
  ignore.push(
    path.posix.join(normalizedDistPath, FILE_PATTERNS.FRAMEWORK_CHUNKS),
    path.posix.join(normalizedDistPath, FILE_PATTERNS.FRAMEWORK_CHUNKS_DOT),
    path.posix.join(normalizedDistPath, FILE_PATTERNS.POLYFILLS_CHUNKS),
    path.posix.join(normalizedDistPath, FILE_PATTERNS.WEBPACK_CHUNKS),
  );

  return ignore;
}

/**
 * Creates file patterns for deletion after source map upload
 */
function createFilesToDeleteAfterUpload(
  normalizedDistPath: string,
  buildTool: BuildTool,
  deleteSourcemapsAfterUpload: boolean,
  useRunAfterProductionCompileHook: boolean = false,
): string[] | undefined {
  if (!deleteSourcemapsAfterUpload) {
    return undefined;
  }

  // We don't want to delete source maps for server builds as this led to errors on Vercel in the past
  // See: https://github.com/getsentry/sentry-javascript/issues/13099
  if (buildTool === 'webpack-nodejs' || buildTool === 'webpack-edge') {
    return undefined;
  }

  // Skip deletion for webpack client builds when using the experimental hook
  if (buildTool === 'webpack-client' && useRunAfterProductionCompileHook) {
    return undefined;
  }

  return SOURCEMAP_EXTENSIONS.map(ext => path.posix.join(normalizedDistPath, 'static', '**', ext));
}

/**
 * Determines if sourcemap uploads should be skipped
 */
function shouldSkipSourcemapUpload(buildTool: BuildTool, useRunAfterProductionCompileHook: boolean = false): boolean {
  return useRunAfterProductionCompileHook && buildTool.startsWith('webpack');
}

/**
 * Source rewriting function for webpack sources
 */
function rewriteWebpackSources(source: string): string {
  if (source.startsWith('webpack://_N_E/')) {
    return source.replace('webpack://_N_E/', '');
  } else if (source.startsWith('webpack://')) {
    return source.replace('webpack://', '');
  } else {
    return source;
  }
}

/**
 * Creates release configuration
 */
function createReleaseConfig(
  releaseName: string | undefined,
  sentryBuildOptions: SentryBuildOptions,
): SentryBuildPluginOptions['release'] {
  if (releaseName !== undefined) {
    return {
      inject: false, // The webpack plugin's release injection breaks the `app` directory - we inject the release manually with the value injection loader instead.
      name: releaseName,
      create: sentryBuildOptions.release?.create,
      finalize: sentryBuildOptions.release?.finalize,
      dist: sentryBuildOptions.release?.dist,
      vcsRemote: sentryBuildOptions.release?.vcsRemote,
      setCommits: sentryBuildOptions.release?.setCommits,
      deploy: sentryBuildOptions.release?.deploy,
      ...sentryBuildOptions.unstable_sentryWebpackPluginOptions?.release,
    };
  }

  return {
    inject: false,
    create: false,
    finalize: false,
  };
}

/**
 * Get Sentry Build Plugin options for both webpack and turbopack builds.
 * These options can be used in two ways:
 * 1. The options can be built in a single operation after the production build completes
 * 2. The options can be built in multiple operations, one for each webpack build
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
  buildTool: BuildTool;
  useRunAfterProductionCompileHook?: boolean; // Whether the user has opted into using the experimental hook
}): SentryBuildPluginOptions {
  // We need to convert paths to posix because Glob patterns use `\` to escape
  // glob characters. This clashes with Windows path separators.
  // See: https://www.npmjs.com/package/glob
  const normalizedDistDirAbsPath = normalizePathForGlob(distDirAbsPath);

  const loggerPrefix = LOGGER_PREFIXES[buildTool];
  const widenClientFileUpload = sentryBuildOptions.widenClientFileUpload ?? false;
  const deleteSourcemapsAfterUpload = sentryBuildOptions.sourcemaps?.deleteSourcemapsAfterUpload ?? false;

  const sourcemapUploadAssets = createSourcemapUploadAssets(normalizedDistDirAbsPath, buildTool, widenClientFileUpload);

  const sourcemapUploadIgnore = createSourcemapUploadIgnore(normalizedDistDirAbsPath, widenClientFileUpload);

  const filesToDeleteAfterUpload = createFilesToDeleteAfterUpload(
    normalizedDistDirAbsPath,
    buildTool,
    deleteSourcemapsAfterUpload,
    useRunAfterProductionCompileHook,
  );

  const skipSourcemapsUpload = shouldSkipSourcemapUpload(buildTool, useRunAfterProductionCompileHook);

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
      disable: skipSourcemapsUpload ? true : (sentryBuildOptions.sourcemaps?.disable ?? false),
      rewriteSources: rewriteWebpackSources,
      assets: sentryBuildOptions.sourcemaps?.assets ?? sourcemapUploadAssets,
      ignore: sentryBuildOptions.sourcemaps?.ignore ?? sourcemapUploadIgnore,
      filesToDeleteAfterUpload,
      ...sentryBuildOptions.unstable_sentryWebpackPluginOptions?.sourcemaps,
    },
    release: createReleaseConfig(releaseName, sentryBuildOptions),
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
