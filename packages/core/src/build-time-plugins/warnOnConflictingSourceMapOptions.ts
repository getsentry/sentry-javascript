import { consoleSandbox } from '../utils/debug-logger';

/** The source map options that can conflict with each other. */
export interface ConflictingSourceMapOptions {
  disable?: boolean | 'disable-upload';
  upload?: boolean;
  injectDebugIds?: boolean;
  delete?: boolean;
  deleteSourcemapsAfterUpload?: unknown;
  filesToDeleteAfterUpload?: unknown;
}

// An SDK and each of its plugin instances call this for the same options.
const loggedWarnings = new Set<string>();

/**
 * Warns about `sourcemaps` options that conflict with each other. It logs
 * each warning once per process.
 *
 * The bundler plugin calls this for the options it gets. SDKs that apply some of the options
 * themselves call it with the user's options, because the plugin does not see them all.
 *
 * @param sourcemaps The user's `sourcemaps` options, if any.
 * @param logWarning Called with each warning message. Defaults to `console.warn` with a
 * `[Sentry]` prefix. Pass a logger that adds its own prefix to route the warnings through it.
 *
 * @internal Only meant for Sentry-internal SDK usage.
 * @hidden
 */
export function warnOnConflictingSourceMapOptions(
  sourcemaps: ConflictingSourceMapOptions | undefined,
  logWarning: (message: string) => void = message =>
    consoleSandbox(() => {
      // eslint-disable-next-line no-console
      console.warn(`[Sentry] ${message}`);
    }),
): void {
  if (!sourcemaps) {
    return;
  }

  const warn = (message: string): void => {
    if (!loggedWarnings.has(message)) {
      loggedWarnings.add(message);
      logWarning(message);
    }
  };

  const usesFeatureOptions = sourcemaps.upload !== undefined || sourcemaps.injectDebugIds !== undefined;
  // TODO(v12): Remove along with `sourcemaps.disable`.
  if (usesFeatureOptions && sourcemaps.disable !== undefined) {
    warn(
      '`sourcemaps.disable` is ignored because `sourcemaps.upload` or `sourcemaps.injectDebugIds` is set. Please remove `sourcemaps.disable`.',
    );
  }
  if (sourcemaps.injectDebugIds === false && sourcemaps.upload === true) {
    warn(
      '`sourcemaps.upload` is set, but `sourcemaps.injectDebugIds` is `false`. Source maps are not uploaded, because the upload matches files by debug ID.',
    );
  }
  if (sourcemaps.delete !== undefined && sourcemaps.deleteSourcemapsAfterUpload !== undefined) {
    warn(
      '`sourcemaps.deleteSourcemapsAfterUpload` is ignored because `sourcemaps.delete` is set. Please remove `sourcemaps.deleteSourcemapsAfterUpload`.',
    );
  }
  if (sourcemaps.delete === false && sourcemaps.filesToDeleteAfterUpload !== undefined) {
    warn(
      '`sourcemaps.filesToDeleteAfterUpload` still deletes the files it matches, although `sourcemaps.delete` is `false`. Remove `sourcemaps.filesToDeleteAfterUpload` to keep the source maps.',
    );
  }
}
