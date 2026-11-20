import type { InternalOptions as SentryBuildPluginOptions } from '@sentry/bundler-plugins/core';
import { resolveSourceMapsFeatures } from '@sentry/core';
import type { SentryBuildOptions } from './types';

type SourceMapsOptions = SentryBuildOptions['sourcemaps'];

/**
 * Whether Sentry turns source maps on that the user did not set: when it uploads them, or when
 * `sourcemaps.delete: false` keeps them for a manual upload.
 */
export function sentryEnablesSourceMaps(sourcemaps: SourceMapsOptions): boolean {
  const { injectDebugIds, upload } = resolveSourceMapsFeatures(sourcemaps);
  return upload || (sourcemaps?.delete === false && injectDebugIds);
}

/** Reads `sourcemaps.delete`. When it is unset, `sourcemaps.deleteSourcemapsAfterUpload` decides. */
export function getDeleteSourceMapsOption(sourcemaps: SourceMapsOptions): boolean | undefined {
  return sourcemaps?.delete ?? sourcemaps?.deleteSourcemapsAfterUpload;
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
 * `disable`, `upload` and `injectDebugIds` for the bundler plugin. It warns when `disable` is set next to the
 * options that replace it, so `disable` gets no default then.
 */
// TODO(v12): Remove `disable`.
export function getSourceMapFeatureOptions(
  userSourcemaps: SourceMapsOptions,
  skipSourcemapsUpload: boolean,
): Pick<NonNullable<SentryBuildPluginOptions['sourcemaps']>, 'disable' | 'upload' | 'injectDebugIds'> {
  if (skipSourcemapsUpload) {
    return { disable: true };
  }

  const { disable, upload, injectDebugIds } = userSourcemaps ?? {};
  const usesFeatureOptions = upload !== undefined || injectDebugIds !== undefined;
  return { disable: disable ?? (usesFeatureOptions ? undefined : false), upload, injectDebugIds };
}
