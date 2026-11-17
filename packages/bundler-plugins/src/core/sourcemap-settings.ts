import { resolveSourceMapsFeatures } from '@sentry/core';
import type { NormalizedOptions } from './options-mapping';

/**
 * The user's source map setting in the bundler, reduced to what matters for upload and deletion.
 *
 * - `unset`: the user did not configure source maps
 * - `off`: source map generation is turned off
 * - `visible`: separate map files with a `sourceMappingURL` comment
 * - `hidden`: separate map files without the comment
 * - `inline`: the map is embedded into the bundle
 */
export type SourceMapKind = 'unset' | 'off' | 'visible' | 'hidden' | 'inline';

export type SourceMapDecision = {
  /** Switch the bundler to hidden source maps. */
  enableHidden: boolean;
  /** Remove the source maps from the build output once they are uploaded. */
  deleteAfterUpload: boolean;
  /**
   * With `deleteAfterUpload`, remove every source map of the build, also those of CSS and of chunks
   * the upload leaves out. Set when the plugin or the SDK turned the source maps on.
   */
  removeAllSourceMaps?: boolean;
  log?: { level: 'info' | 'warn'; message: string };
};

const NO_CHANGE: SourceMapDecision = { enableHidden: false, deleteAfterUpload: false };

const SOURCE_MAPS_OFF_MESSAGE =
  'Source map generation is turned off in your bundler, so Sentry cannot un-minify your stack traces. ' +
  'Remove the setting to let the plugin generate hidden source maps, upload them to Sentry and remove them from the build output.';

const INLINE_SOURCE_MAPS_MESSAGE =
  'Source maps are inlined into your bundles. They are uploaded to Sentry, but inline source maps ship your source code to users and cannot be removed after the upload. ' +
  'Remove the setting to let the plugin generate hidden source maps instead.';

export type SourceMapFeatures = {
  /** The plugin adds debug IDs to the bundles and their source maps. */
  injectDebugIds: boolean;
  /** The plugin uploads the source maps. Never `true` without `injectDebugIds`. */
  upload: boolean;
  /**
   * The plugin writes the debug IDs into the emitted files and source maps. The upload only stamps
   * temp copies, so without an upload the emitted files get them and a later manual upload needs
   * no inject step.
   */
  stampEmittedFiles: boolean;
};

/**
 * Reads `sourcemaps.upload` and `sourcemaps.injectDebugIds`. When neither is set,
 * `sourcemaps.disable` decides.
 */
export function getSourceMapFeatures(options: NormalizedOptions): SourceMapFeatures {
  const { injectDebugIds, upload } = resolveSourceMapsFeatures(options.sourcemaps);

  return { injectDebugIds, upload, stampEmittedFiles: injectDebugIds && !upload };
}

/** Reads `sourcemaps.deleteSourcemapsAfterUpload`, calling the internal function form if given. */
export function getDeleteSourcemapsAfterUpload(options: NormalizedOptions, environment?: string): boolean | undefined {
  const value = options.sourcemaps?.deleteSourcemapsAfterUpload;
  return typeof value === 'function' ? value(environment) : value;
}

/** Reads `sourcemaps.delete`. When it is unset, `sourcemaps.deleteSourcemapsAfterUpload` decides. */
export function getDeleteOption(options: NormalizedOptions, environment?: string): boolean | undefined {
  return options.sourcemaps?.delete ?? getDeleteSourcemapsAfterUpload(options, environment);
}

/** Reads the internal `sourcemaps.sdkEnabledSourceMaps` option, calling its function form if given. */
export function getSdkEnabledSourceMaps(options: NormalizedOptions, environment?: string): boolean {
  const value = options.sourcemaps?.sdkEnabledSourceMaps;
  return (typeof value === 'function' ? value(environment) : value) === true;
}

/**
 * Decides whether the plugin turns hidden source maps on and whether it removes the maps from the
 * build output after the upload. The plugin only turns maps on when an upload can run, and only
 * removes maps it turned on itself unless `deleteSourcemapsAfterUpload` says otherwise.
 */
export function decideSourceMapHandling(
  kind: SourceMapKind,
  options: NormalizedOptions,
  uploadPossible: boolean,
  environment?: string,
): SourceMapDecision {
  const features = getSourceMapFeatures(options);

  if (options.sourcemaps?.delete !== undefined) {
    return decideWithDeleteOption(kind, options.sourcemaps.delete, features, uploadPossible);
  }

  const deleteOption = getDeleteSourcemapsAfterUpload(options, environment);
  const sdkEnabledSourceMaps = getSdkEnabledSourceMaps(options, environment);

  if (!uploadPossible || !features.upload) {
    if (deleteOption !== true || (kind !== 'hidden' && kind !== 'visible')) {
      return NO_CHANGE;
    }
    // Users switch the upload off to upload the maps themselves. Maps the
    // SDK turned on are still removed, as the SDKs' own globs did.
    if (!features.upload && !sdkEnabledSourceMaps) {
      return {
        ...NO_CHANGE,
        log: {
          level: 'warn',
          message: `\`sourcemaps.deleteSourcemapsAfterUpload\` is set, but source map upload is disabled with ${
            resolveSourceMapsFeatures(options.sourcemaps).legacyDisable
              ? '`sourcemaps.disable`'
              : '`sourcemaps.upload` or `sourcemaps.injectDebugIds`'
          }, so the source maps are not removed.`,
        },
      };
    }
    return {
      enableHidden: kind === 'visible',
      deleteAfterUpload: true,
      removeAllSourceMaps: sdkEnabledSourceMaps,
      log: {
        level: 'warn',
        message:
          'Source maps are not uploaded, but they are removed from the build output because `sourcemaps.deleteSourcemapsAfterUpload` is set.',
      },
    };
  }

  switch (kind) {
    case 'off':
      return {
        ...NO_CHANGE,
        log: {
          level: 'warn',
          message: SOURCE_MAPS_OFF_MESSAGE,
        },
      };

    case 'inline':
      return {
        ...NO_CHANGE,
        log: {
          level: 'warn',
          message: INLINE_SOURCE_MAPS_MESSAGE,
        },
      };

    case 'unset':
      if (deleteOption === false) {
        return {
          enableHidden: true,
          deleteAfterUpload: false,
          log: {
            level: 'info',
            message: 'Enabling hidden source maps. They are uploaded to Sentry and kept in the build output.',
          },
        };
      }
      return {
        enableHidden: true,
        deleteAfterUpload: true,
        removeAllSourceMaps: true,
        log: {
          level: 'info',
          message:
            'Enabling hidden source maps. They are uploaded to Sentry and removed from the build output. ' +
            'Set `sourcemaps.deleteSourcemapsAfterUpload: false` to keep them.',
        },
      };

    case 'hidden':
      if (deleteOption !== true) {
        return NO_CHANGE;
      }
      return { enableHidden: false, deleteAfterUpload: true, removeAllSourceMaps: sdkEnabledSourceMaps };

    case 'visible':
      if (deleteOption !== true) {
        return NO_CHANGE;
      }
      return {
        enableHidden: true,
        deleteAfterUpload: true,
        removeAllSourceMaps: sdkEnabledSourceMaps,
        log: {
          level: 'info',
          message:
            'Switching to hidden source maps because `sourcemaps.deleteSourcemapsAfterUpload` is set. ' +
            'Without the `sourceMappingURL` comment browsers do not request the removed map files.',
        },
      };
  }
}

/**
 * The decision when `sourcemaps.delete` is set. Unlike `deleteSourcemapsAfterUpload`, it does not
 * depend on an upload: `true` removes every source map of the build, and `false` keeps the hidden
 * source maps the plugin turns on, also when nothing is uploaded.
 */
function decideWithDeleteOption(
  kind: SourceMapKind,
  deleteSourceMaps: boolean,
  features: SourceMapFeatures,
  uploadPossible: boolean,
): SourceMapDecision {
  switch (kind) {
    case 'off':
      return uploadPossible ? { ...NO_CHANGE, log: { level: 'warn', message: SOURCE_MAPS_OFF_MESSAGE } } : NO_CHANGE;

    case 'inline':
      return uploadPossible ? { ...NO_CHANGE, log: { level: 'warn', message: INLINE_SOURCE_MAPS_MESSAGE } } : NO_CHANGE;

    case 'unset':
      if (deleteSourceMaps) {
        // Maps that are only turned on to be removed again are not turned on.
        return uploadPossible
          ? {
              enableHidden: true,
              deleteAfterUpload: true,
              removeAllSourceMaps: true,
              log: {
                level: 'info',
                message: 'Enabling hidden source maps. They are uploaded to Sentry and removed from the build output.',
              },
            }
          : NO_CHANGE;
      }
      // Without debug IDs the maps are of no use to Sentry.
      if (!features.injectDebugIds) {
        return NO_CHANGE;
      }
      return {
        enableHidden: true,
        deleteAfterUpload: false,
        log: {
          level: 'info',
          message: uploadPossible
            ? 'Enabling hidden source maps. They are uploaded to Sentry and kept in the build output.'
            : 'Enabling hidden source maps. They are not uploaded to Sentry and are kept in the build output, because `sourcemaps.delete` is `false`.',
        },
      };

    case 'hidden':
    case 'visible':
      if (!deleteSourceMaps) {
        return NO_CHANGE;
      }
      return {
        enableHidden: kind === 'visible',
        deleteAfterUpload: true,
        removeAllSourceMaps: true,
        log: uploadPossible
          ? kind === 'visible'
            ? {
                level: 'info',
                message:
                  'Switching to hidden source maps because `sourcemaps.delete` is set. ' +
                  'Without the `sourceMappingURL` comment browsers do not request the removed map files.',
              }
            : undefined
          : {
              level: 'warn',
              message:
                'Source maps are not uploaded, but they are removed from the build output because `sourcemaps.delete` is set.',
            },
      };
  }
}
