import { handleRunAfterProductionCompile } from '../handleRunAfterProductionCompile';
import type { RouteManifest } from '../manifest/types';
import { constructTurbopackConfig } from '../turbopack';
import type { NextConfigObject, SentryBuildOptions, TurbopackOptions } from '../types';
import { detectActiveBundler, supportsProductionCompileHook } from '../util';
import { constructWebpackConfigFunction } from '../webpack';
import { DEFAULT_SERVER_EXTERNAL_PACKAGES } from './constants';

/**
 * Information about the active bundler and feature support based on Next.js version.
 */
export type BundlerInfo = {
  isTurbopack: boolean;
  isWebpack: boolean;
  isTurbopackSupported: boolean;
};

/**
 * Detects which bundler is active (webpack vs turbopack) and whether turbopack features are supported.
 */
export function getBundlerInfo(nextJsVersion: string | undefined): BundlerInfo {
  const activeBundler = detectActiveBundler();
  const isTurbopack = activeBundler === 'turbopack';
  const isWebpack = activeBundler === 'webpack';
  const isTurbopackSupported = supportsProductionCompileHook(nextJsVersion ?? '');

  return { isTurbopack, isWebpack, isTurbopackSupported };
}

/**
 * Warns if turbopack is in use but the detected Next.js version is unsupported.
 */
export function maybeWarnAboutUnsupportedTurbopack(nextJsVersion: string | undefined, bundlerInfo: BundlerInfo): void {
  // Warn if using turbopack with an unsupported Next.js version
  if (!bundlerInfo.isTurbopackSupported && bundlerInfo.isTurbopack) {
    // eslint-disable-next-line no-console
    console.warn(
      `[@sentry/nextjs] WARNING: You are using the Sentry SDK with Turbopack. The Sentry SDK is compatible with Turbopack on Next.js version 15.4.1 or later. You are currently on ${nextJsVersion}. Please upgrade to a newer Next.js version to use the Sentry SDK with Turbopack.`,
    );
  }
}

/**
 * Warns if `useRunAfterProductionCompileHook` is enabled in webpack mode but the Next.js version is unsupported.
 */
export function maybeWarnAboutUnsupportedRunAfterProductionCompileHook(
  nextJsVersion: string | undefined,
  userSentryOptions: SentryBuildOptions,
  bundlerInfo: BundlerInfo,
): void {
  // Webpack case - warn if trying to use runAfterProductionCompile hook with unsupported Next.js version
  if (
    userSentryOptions.useRunAfterProductionCompileHook &&
    !supportsProductionCompileHook(nextJsVersion ?? '') &&
    bundlerInfo.isWebpack
  ) {
    // eslint-disable-next-line no-console
    console.warn(
      '[@sentry/nextjs] The configured `useRunAfterProductionCompileHook` option is not compatible with your current Next.js version. This option is only supported on Next.js version 15.4.1 or later. Will not run source map and release management logic.',
    );
  }
}

/**
 * Constructs turbopack config when turbopack is active.
 */
export function maybeConstructTurbopackConfig(
  incomingUserNextConfigObject: NextConfigObject,
  userSentryOptions: SentryBuildOptions,
  routeManifest: RouteManifest | undefined,
  nextJsVersion: string | undefined,
  bundlerInfo: BundlerInfo,
): TurbopackOptions | undefined {
  if (!bundlerInfo.isTurbopack) {
    return undefined;
  }

  return constructTurbopackConfig({
    userNextConfig: incomingUserNextConfigObject,
    userSentryOptions,
    routeManifest,
    nextJsVersion,
  });
}

/**
 * Resolves whether to use the `runAfterProductionCompile` hook based on options and bundler.
 */
export function resolveUseRunAfterProductionCompileHookOption(
  userSentryOptions: SentryBuildOptions,
  bundlerInfo: BundlerInfo,
): boolean {
  // If not explicitly set, turbopack uses the runAfterProductionCompile hook (as there are no alternatives), webpack does not.
  return userSentryOptions.useRunAfterProductionCompileHook ?? (bundlerInfo.isTurbopack ? true : false);
}

/**
 * Hooks into Next.js' `compiler.runAfterProductionCompile` to run Sentry release/sourcemap handling.
 *
 * Note: this mutates `incomingUserNextConfigObject`.
 */
export function maybeSetUpRunAfterProductionCompileHook({
  incomingUserNextConfigObject,
  userSentryOptions,
  releaseName,
  nextJsVersion,
  bundlerInfo,
  turboPackConfig,
  shouldUseRunAfterProductionCompileHook,
}: {
  incomingUserNextConfigObject: NextConfigObject;
  userSentryOptions: SentryBuildOptions;
  releaseName: string | undefined;
  nextJsVersion: string | undefined;
  bundlerInfo: BundlerInfo;
  turboPackConfig: TurbopackOptions | undefined;
  shouldUseRunAfterProductionCompileHook: boolean;
}): void {
  if (!shouldUseRunAfterProductionCompileHook) {
    return;
  }

  if (!supportsProductionCompileHook(nextJsVersion ?? '')) {
    return;
  }

  if (incomingUserNextConfigObject?.compiler?.runAfterProductionCompile === undefined) {
    incomingUserNextConfigObject.compiler ??= {};

    incomingUserNextConfigObject.compiler.runAfterProductionCompile = async ({ distDir }) => {
      await handleRunAfterProductionCompile(
        {
          releaseName,
          distDir,
          buildTool: bundlerInfo.isTurbopack ? 'turbopack' : 'webpack',
          usesNativeDebugIds: bundlerInfo.isTurbopack ? turboPackConfig?.debugIds : undefined,
        },
        userSentryOptions,
      );
    };
    return;
  }

  if (typeof incomingUserNextConfigObject.compiler.runAfterProductionCompile === 'function') {
    incomingUserNextConfigObject.compiler.runAfterProductionCompile = new Proxy(
      incomingUserNextConfigObject.compiler.runAfterProductionCompile,
      {
        async apply(target, thisArg, argArray) {
          const { distDir }: { distDir: string } = argArray[0] ?? { distDir: '.next' };
          await target.apply(thisArg, argArray);
          await handleRunAfterProductionCompile(
            {
              releaseName,
              distDir,
              buildTool: bundlerInfo.isTurbopack ? 'turbopack' : 'webpack',
              usesNativeDebugIds: bundlerInfo.isTurbopack ? turboPackConfig?.debugIds : undefined,
            },
            userSentryOptions,
          );
        },
      },
    );
    return;
  }

  // eslint-disable-next-line no-console
  console.warn(
    '[@sentry/nextjs] The configured `compiler.runAfterProductionCompile` option is not a function. Will not run source map and release management logic.',
  );
}

/**
 * For supported turbopack builds, auto-enables browser sourcemaps and defaults to deleting them after upload.
 *
 * Note: this mutates both `incomingUserNextConfigObject` and `userSentryOptions`.
 */
export function maybeEnableTurbopackSourcemaps(
  incomingUserNextConfigObject: NextConfigObject,
  userSentryOptions: SentryBuildOptions,
  bundlerInfo: BundlerInfo,
): void {
  // Enable source maps for turbopack builds
  if (!bundlerInfo.isTurbopackSupported || !bundlerInfo.isTurbopack || userSentryOptions.sourcemaps?.disable) {
    return;
  }

  // Only set if not already configured by user
  if (incomingUserNextConfigObject.productionBrowserSourceMaps !== undefined) {
    return;
  }

  if (userSentryOptions.debug) {
    // eslint-disable-next-line no-console
    console.log('[@sentry/nextjs] Automatically enabling browser source map generation for turbopack build.');
  }
  incomingUserNextConfigObject.productionBrowserSourceMaps = true;

  // Enable source map deletion if not explicitly disabled
  if (userSentryOptions.sourcemaps?.deleteSourcemapsAfterUpload !== undefined) {
    return;
  }

  if (userSentryOptions.debug) {
    // eslint-disable-next-line no-console
    console.warn(
      '[@sentry/nextjs] Source maps will be automatically deleted after being uploaded to Sentry. If you want to keep the source maps, set the `sourcemaps.deleteSourcemapsAfterUpload` option to false in `withSentryConfig()`. If you do not want to generate and upload sourcemaps at all, set the `sourcemaps.disable` option to true.',
    );
  }

  userSentryOptions.sourcemaps = {
    ...userSentryOptions.sourcemaps,
    deleteSourcemapsAfterUpload: true,
  };
}

/**
 * Returns the patch which ensures server-side auto-instrumented packages are externalized.
 */
export function getServerExternalPackagesPatch(
  incomingUserNextConfigObject: NextConfigObject,
  nextMajor: number | undefined,
): Partial<NextConfigObject> {
  if (nextMajor && nextMajor >= 15) {
    return {
      serverExternalPackages: [
        ...(incomingUserNextConfigObject.serverExternalPackages || []),
        ...DEFAULT_SERVER_EXTERNAL_PACKAGES,
      ],
    };
  }

  return {
    experimental: {
      ...incomingUserNextConfigObject.experimental,
      serverComponentsExternalPackages: [
        ...(incomingUserNextConfigObject.experimental?.serverComponentsExternalPackages || []),
        ...DEFAULT_SERVER_EXTERNAL_PACKAGES,
      ],
    },
  };
}

/**
 * Returns the patch for injecting Sentry's webpack config function (if enabled and applicable).
 */
export function getWebpackPatch({
  incomingUserNextConfigObject,
  userSentryOptions,
  releaseName,
  routeManifest,
  nextJsVersion,
  shouldUseRunAfterProductionCompileHook,
  bundlerInfo,
}: {
  incomingUserNextConfigObject: NextConfigObject;
  userSentryOptions: SentryBuildOptions;
  releaseName: string | undefined;
  routeManifest: RouteManifest | undefined;
  nextJsVersion: string | undefined;
  shouldUseRunAfterProductionCompileHook: boolean;
  bundlerInfo: BundlerInfo;
}): Partial<NextConfigObject> {
  if (!bundlerInfo.isWebpack || userSentryOptions.webpack?.disableSentryConfig) {
    return {};
  }

  return {
    webpack: constructWebpackConfigFunction({
      userNextConfig: incomingUserNextConfigObject,
      userSentryOptions,
      releaseName,
      routeManifest,
      nextJsVersion,
      useRunAfterProductionCompileHook: shouldUseRunAfterProductionCompileHook,
    }),
  };
}

/**
 * Returns the patch for adding turbopack config (if enabled and supported).
 */
export function getTurbopackPatch(
  bundlerInfo: BundlerInfo,
  turboPackConfig: TurbopackOptions | undefined,
): Partial<NextConfigObject> {
  if (!bundlerInfo.isTurbopackSupported || !bundlerInfo.isTurbopack) {
    return {};
  }

  return { turbopack: turboPackConfig };
}
