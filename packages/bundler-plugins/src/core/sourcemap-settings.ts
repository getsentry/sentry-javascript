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

/** Reads `sourcemaps.deleteSourcemapsAfterUpload`, calling the internal function form if given. */
export function getDeleteSourcemapsAfterUpload(options: NormalizedOptions): boolean | undefined {
  const value = options.sourcemaps?.deleteSourcemapsAfterUpload;
  return typeof value === 'function' ? value() : value;
}

/** Reads the internal `sourcemaps.sdkEnabledSourceMaps` option, calling its function form if given. */
export function getSdkEnabledSourceMaps(options: NormalizedOptions): boolean {
  const value = options.sourcemaps?.sdkEnabledSourceMaps;
  return (typeof value === 'function' ? value() : value) === true;
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
): SourceMapDecision {
  const deleteOption = getDeleteSourcemapsAfterUpload(options);
  const sdkEnabledSourceMaps = getSdkEnabledSourceMaps(options);

  if (!uploadPossible || options.sourcemaps?.disable) {
    if (deleteOption !== true || (kind !== 'hidden' && kind !== 'visible')) {
      return NO_CHANGE;
    }
    return {
      enableHidden: kind === 'visible',
      deleteAfterUpload: true,
      removeAllSourceMaps: sdkEnabledSourceMaps,
      log: {
        level: 'info',
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
          message:
            'Source map generation is turned off in your bundler, so Sentry cannot un-minify your stack traces. ' +
            'Remove the setting to let the plugin generate hidden source maps, upload them to Sentry and remove them from the build output.',
        },
      };

    case 'inline':
      return {
        ...NO_CHANGE,
        log: {
          level: 'warn',
          message:
            'Source maps are inlined into your bundles. They are uploaded to Sentry, but inline source maps ship your source code to users and cannot be removed after the upload. ' +
            'Remove the setting to let the plugin generate hidden source maps instead.',
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
