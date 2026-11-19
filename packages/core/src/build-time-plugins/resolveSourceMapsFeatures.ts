/**
 * What the Sentry build step does with source maps, resolved from the build options.
 */
export interface SourceMapsFeatures {
  /** Sentry injects debug IDs into the bundles and their source maps. */
  injectDebugIds: boolean;
  /** Sentry uploads the source maps. Never `true` without `injectDebugIds`. */
  upload: boolean;
  /**
   * The `sourcemaps.disable` value that decided the two fields above. Unset when `disable` is not
   * set or when `sourcemaps.upload` or `sourcemaps.injectDebugIds` replaces it. SDKs read this to
   * keep what `disable` does there beyond the two features.
   */
  legacyDisable?: true | 'disable-upload';
}

/**
 * Reads `sourcemaps.upload` and `sourcemaps.injectDebugIds`. When neither is set,
 * `sourcemaps.disable` decides.
 *
 * @internal Only meant for Sentry-internal SDK usage.
 * @hidden
 */
// TODO(v12): Remove the `disable` handling along with `sourcemaps.disable`.
export function resolveSourceMapsFeatures(
  sourcemaps: { upload?: boolean; injectDebugIds?: boolean; disable?: boolean | 'disable-upload' } | undefined,
): SourceMapsFeatures {
  const { upload, injectDebugIds, disable } = sourcemaps ?? {};

  if (upload === undefined && injectDebugIds === undefined) {
    return {
      injectDebugIds: disable !== true,
      upload: !disable,
      ...(disable ? { legacyDisable: disable } : {}),
    };
  }

  // The upload matches files by debug ID, so it cannot run without them.
  return { injectDebugIds: injectDebugIds !== false, upload: injectDebugIds !== false && upload !== false };
}
