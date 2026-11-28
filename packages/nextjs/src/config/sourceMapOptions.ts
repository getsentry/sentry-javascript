import type { InternalOptions as SentryBuildPluginOptions } from '@sentry/bundler-plugins/core';
import { hasSourceMapUploadCredentials } from '@sentry/bundler-plugins/core';
import { resolveSourceMapsFeatures } from '@sentry/core';
import type { SentryBuildOptions } from './types';

type SourceMapsOptions = SentryBuildOptions['sourcemaps'];

/**
 * Whether Sentry turns source maps on that the user did not set: when it can upload them, or when
 * `sourcemaps.delete: false` keeps them for a manual upload.
 *
 * @param uploadStepRuns Whether a build step runs that uploads and deletes the source maps.
 */
export function sentryEnablesSourceMaps(options: SentryBuildOptions, uploadStepRuns: boolean): boolean {
  const { sourcemaps } = options;
  const { injectDebugIds, upload } = resolveSourceMapsFeatures(sourcemaps);
  return (
    (uploadStepRuns && upload && hasSourceMapUploadCredentials(options)) ||
    (sourcemaps?.delete === false && injectDebugIds)
  );
}

export const SDK_DELETES_SOURCE_MAPS_MESSAGE =
  '[@sentry/nextjs] Source maps will be deleted after the upload to Sentry. To keep them, set `sourcemaps.delete: false` in `withSentryConfig()`. To neither generate nor upload source maps, set `sourcemaps.upload: false`.';

// Every build phase that runs in this process gets the same options object.
const sdkDeletesSourceMaps = new WeakSet<SentryBuildOptions>();

/**
 * Makes the SDK delete the source maps after the upload when the user set neither `sourcemaps.delete`
 * nor `sourcemaps.deleteSourcemapsAfterUpload`.
 */
export function setSdkDeletesSourceMaps(options: SentryBuildOptions): void {
  sdkDeletesSourceMaps.add(options);
}

/**
 * Reads `sourcemaps.delete`. When it is unset, `sourcemaps.deleteSourcemapsAfterUpload` decides, and
 * then `setSdkDeletesSourceMaps`.
 */
export function getDeleteSourceMapsOption(options: SentryBuildOptions): boolean | undefined {
  const { sourcemaps } = options;
  return (
    sourcemaps?.delete ?? sourcemaps?.deleteSourcemapsAfterUpload ?? (sdkDeletesSourceMaps.has(options) || undefined)
  );
}

/**
 * The user's `filesToDeleteAfterUpload` replace the SDK's patterns. With `sourcemaps.delete: true` both apply.
 */
export function mergeFilesToDeleteAfterUpload(
  defaultFiles: string[] | undefined,
  userFiles: string | string[] | undefined,
  userFilesReplaceDeletion: boolean,
): string[] | undefined {
  if (userFiles === undefined) {
    return defaultFiles;
  }

  const userFilesArray = [userFiles].flat();
  return defaultFiles && !userFilesReplaceDeletion ? [...defaultFiles, ...userFilesArray] : userFilesArray;
}

/**
 * `disable`, `upload` and `injectDebugIds` for the bundler plugin. `disable` is only ever the user's own value.
 */
// TODO(v12): Remove `disable`.
export function getSourceMapFeatureOptions(
  userSourcemaps: SourceMapsOptions,
  skipSourcemapsUpload: boolean,
): Pick<NonNullable<SentryBuildPluginOptions['sourcemaps']>, 'disable' | 'upload' | 'injectDebugIds'> {
  if (skipSourcemapsUpload) {
    return { upload: false, injectDebugIds: false };
  }

  const { disable, upload, injectDebugIds } = userSourcemaps ?? {};
  return { disable, upload, injectDebugIds };
}
