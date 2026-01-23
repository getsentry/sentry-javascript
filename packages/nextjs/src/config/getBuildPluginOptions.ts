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
// We use both glob patterns and directory paths for the sourcemap upload and deletion
// -> Direct CLI invocation handles file paths better than glob patterns
// -> Webpack/Bundler needs glob patterns as this is the format that is used by the plugin
const FILE_PATTERNS = {
  SERVER: {
    GLOB: 'server/**',
    PATH: 'server',
  },
  SERVERLESS: 'serverless/**',
  STATIC_CHUNKS: {
    GLOB: 'static/chunks/**',
    PATH: 'static/chunks',
  },
  STATIC_CHUNKS_PAGES: {
    GLOB: 'static/chunks/pages/**',
    PATH: 'static/chunks/pages',
  },
  STATIC_CHUNKS_APP: {
    GLOB: 'static/chunks/app/**',
    PATH: 'static/chunks/app',
  },
  MAIN_CHUNKS: 'static/chunks/main-*',
  FRAMEWORK_CHUNKS: 'static/chunks/framework-*',
  FRAMEWORK_CHUNKS_DOT: 'static/chunks/framework.*',
  POLYFILLS_CHUNKS: 'static/chunks/polyfills-*',
  WEBPACK_CHUNKS: 'static/chunks/webpack-*',
  PAGE_CLIENT_REFERENCE_MANIFEST: '**/page_client-reference-manifest.js',
  SERVER_REFERENCE_MANIFEST: '**/server-reference-manifest.js',
  NEXT_FONT_MANIFEST: '**/next-font-manifest.js',
  MIDDLEWARE_BUILD_MANIFEST: '**/middleware-build-manifest.js',
  INTERCEPTION_ROUTE_REWRITE_MANIFEST: '**/interception-route-rewrite-manifest.js',
  ROUTE_CLIENT_REFERENCE_MANIFEST: '**/route_client-reference-manifest.js',
  MIDDLEWARE_REACT_LOADABLE_MANIFEST: '**/middleware-react-loadable-manifest.js',
} as const;

// Source map file extensions to delete
const SOURCEMAP_EXTENSIONS = ['*.js.map', '*.mjs.map', '*.cjs.map', '*.css.map'] as const;

type BuildTool = keyof typeof LOGGER_PREFIXES;

/**
 * Normalizes Windows paths to POSIX format for glob patterns
 */
export function normalizePathForGlob(distPath: string): string {
  return distPath.replace(/\\/g, '/');
}

/**
 * These functions are used to get the correct pattern for the sourcemap upload based on the build tool and the usage context
 * -> Direct CLI invocation handles file paths better than glob patterns
 */
function getServerPattern({ useDirectoryPath = false }: { useDirectoryPath?: boolean }): string {
  return useDirectoryPath ? FILE_PATTERNS.SERVER.PATH : FILE_PATTERNS.SERVER.GLOB;
}

function getStaticChunksPattern({ useDirectoryPath = false }: { useDirectoryPath?: boolean }): string {
  return useDirectoryPath ? FILE_PATTERNS.STATIC_CHUNKS.PATH : FILE_PATTERNS.STATIC_CHUNKS.GLOB;
}

function getStaticChunksPagesPattern({ useDirectoryPath = false }: { useDirectoryPath?: boolean }): string {
  return useDirectoryPath ? FILE_PATTERNS.STATIC_CHUNKS_PAGES.PATH : FILE_PATTERNS.STATIC_CHUNKS_PAGES.GLOB;
}

function getStaticChunksAppPattern({ useDirectoryPath = false }: { useDirectoryPath?: boolean }): string {
  return useDirectoryPath ? FILE_PATTERNS.STATIC_CHUNKS_APP.PATH : FILE_PATTERNS.STATIC_CHUNKS_APP.GLOB;
}

/**
 * Creates file patterns for source map uploads based on build tool and options
 */
function createSourcemapUploadAssetPatterns(
  normalizedDistPath: string,
  buildTool: BuildTool,
  widenClientFileUpload: boolean = false,
): string[] {
  const assets: string[] = [];

  if (buildTool.startsWith('after-production-compile')) {
    assets.push(path.posix.join(normalizedDistPath, getServerPattern({ useDirectoryPath: true })));

    if (buildTool === 'after-production-compile-turbopack') {
      // In turbopack we always want to upload the full static chunks directory
      // as the build output is not split into pages|app chunks
      assets.push(path.posix.join(normalizedDistPath, getStaticChunksPattern({ useDirectoryPath: true })));
    } else {
      // Webpack client builds in after-production-compile mode
      if (widenClientFileUpload) {
        assets.push(path.posix.join(normalizedDistPath, getStaticChunksPattern({ useDirectoryPath: true })));
      } else {
        assets.push(
          path.posix.join(normalizedDistPath, getStaticChunksPagesPattern({ useDirectoryPath: true })),
          path.posix.join(normalizedDistPath, getStaticChunksAppPattern({ useDirectoryPath: true })),
        );
      }
    }
  } else {
    if (buildTool === 'webpack-nodejs' || buildTool === 'webpack-edge') {
      // Server builds
      assets.push(
        path.posix.join(normalizedDistPath, getServerPattern({ useDirectoryPath: false })),
        path.posix.join(normalizedDistPath, FILE_PATTERNS.SERVERLESS),
      );
    } else if (buildTool === 'webpack-client') {
      // Client builds
      if (widenClientFileUpload) {
        assets.push(path.posix.join(normalizedDistPath, getStaticChunksPattern({ useDirectoryPath: false })));
      } else {
        assets.push(
          path.posix.join(normalizedDistPath, getStaticChunksPagesPattern({ useDirectoryPath: false })),
          path.posix.join(normalizedDistPath, getStaticChunksAppPattern({ useDirectoryPath: false })),
        );
      }
    }
  }

  return assets;
}

/**
 * Creates ignore patterns for source map uploads
 */
function createSourcemapUploadIgnorePattern(
  normalizedDistPath: string,
  widenClientFileUpload: boolean = false,
): string[] {
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
    // Next.js internal manifest files that don't have source maps
    // These files are auto-generated by Next.js and do not contain user code.
    // Ignoring them prevents "Could not determine source map reference" warnings.
    FILE_PATTERNS.PAGE_CLIENT_REFERENCE_MANIFEST,
    FILE_PATTERNS.SERVER_REFERENCE_MANIFEST,
    FILE_PATTERNS.NEXT_FONT_MANIFEST,
    FILE_PATTERNS.MIDDLEWARE_BUILD_MANIFEST,
    FILE_PATTERNS.INTERCEPTION_ROUTE_REWRITE_MANIFEST,
    FILE_PATTERNS.ROUTE_CLIENT_REFERENCE_MANIFEST,
    FILE_PATTERNS.MIDDLEWARE_REACT_LOADABLE_MANIFEST,
  );

  return ignore;
}

/**
 * Creates file patterns for deletion after source map upload
 */
function createFilesToDeleteAfterUploadPattern(
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
  return source.replace(/^webpack:\/\/(?:_N_E\/)?/, '');
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
      ...sentryBuildOptions.webpack?.unstable_sentryWebpackPluginOptions?.release,
    };
  }

  return {
    inject: false,
    create: false,
    finalize: false,
  };
}

/**
 * Merges default ignore patterns with user-provided ignore patterns.
 * User patterns are appended to the defaults to ensure internal Next.js
 * files are always ignored while allowing users to add additional patterns.
 */
function mergeIgnorePatterns(defaultPatterns: string[], userPatterns: string | string[] | undefined): string[] {
  if (!userPatterns) {
    return defaultPatterns;
  }

  const userPatternsArray = Array.isArray(userPatterns) ? userPatterns : [userPatterns];
  return [...defaultPatterns, ...userPatternsArray];
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

  const sourcemapUploadAssets = createSourcemapUploadAssetPatterns(
    normalizedDistDirAbsPath,
    buildTool,
    widenClientFileUpload,
  );

  const sourcemapUploadIgnore = createSourcemapUploadIgnorePattern(normalizedDistDirAbsPath, widenClientFileUpload);

  const finalIgnorePatterns = mergeIgnorePatterns(sourcemapUploadIgnore, sentryBuildOptions.sourcemaps?.ignore);

  const filesToDeleteAfterUpload = createFilesToDeleteAfterUploadPattern(
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
          ...sentryBuildOptions.webpack?.reactComponentAnnotation,
          ...sentryBuildOptions.webpack?.unstable_sentryWebpackPluginOptions?.reactComponentAnnotation,
        },
    silent: sentryBuildOptions.silent,
    url: sentryBuildOptions.sentryUrl,
    sourcemaps: {
      disable: skipSourcemapsUpload ? true : (sentryBuildOptions.sourcemaps?.disable ?? false),
      rewriteSources: rewriteWebpackSources,
      assets: sentryBuildOptions.sourcemaps?.assets ?? sourcemapUploadAssets,
      ignore: finalIgnorePatterns,
      filesToDeleteAfterUpload,
      ...sentryBuildOptions.webpack?.unstable_sentryWebpackPluginOptions?.sourcemaps,
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
    ...sentryBuildOptions.webpack?.unstable_sentryWebpackPluginOptions,
  };
}
