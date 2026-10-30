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
  log?: { level: 'info' | 'warn'; message: string };
};

const NO_CHANGE: SourceMapDecision = { enableHidden: false, deleteAfterUpload: false };

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
  const deleteOption = options.sourcemaps?.deleteSourcemapsAfterUpload;

  if (!uploadPossible || options.sourcemaps?.disable) {
    return NO_CHANGE;
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
        log: {
          level: 'info',
          message:
            'Enabling hidden source maps. They are uploaded to Sentry and removed from the build output. ' +
            'Set `sourcemaps.deleteSourcemapsAfterUpload: false` to keep them.',
        },
      };

    case 'hidden':
      return { enableHidden: false, deleteAfterUpload: deleteOption === true };

    case 'visible':
      if (deleteOption !== true) {
        return NO_CHANGE;
      }
      return {
        enableHidden: true,
        deleteAfterUpload: true,
        log: {
          level: 'info',
          message:
            'Switching to hidden source maps because `sourcemaps.deleteSourcemapsAfterUpload` is set. ' +
            'Without the `sourceMappingURL` comment browsers do not request the removed map files.',
        },
      };
  }
}
