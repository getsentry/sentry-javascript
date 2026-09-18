/**
 * Compile-time check that the recording stub still matches the real CLI.
 *
 * `index.d.cts` derives its params from the real CLI's types, but the root tsconfig sets
 * `skipLibCheck`, so declaration files are never checked and that import alone proves nothing.
 * This is a regular `.ts` file so it is checked, and referencing each type and method here fails
 * `check:types` if the CLI renames or drops any of the surface the build plugin calls.
 *
 * It has to live outside `fixtures/sentry-stub` because that package is itself named `sentry`,
 * so an import of `sentry` from within it self-references the stub and checks nothing.
 *
 * Only the shape going in is covered. Whether the CLI *accepts* the argv the plugin builds is a
 * runtime question - see the adapter's contract test, which issues these calls for real.
 */
import type {
  ReleaseCreateParams,
  ReleaseFinalizeParams,
  ReleaseSetCommitsParams,
  SentryOptions,
  SourcemapInjectParams,
  SourcemapUploadParams,
  createSentrySDK,
} from 'sentry';

type RealSDK = ReturnType<typeof createSentrySDK>;

/** Fails to compile if the real SDK ever loses a method the plugin depends on. */
type UsedSurface = {
  releaseCreate: RealSDK['release']['create'];
  releaseFinalize: RealSDK['release']['finalize'];
  releaseSetCommits: RealSDK['release']['set-commits'];
  releaseDeploy: RealSDK['release']['deploy'];
  sourcemapUpload: RealSDK['sourcemap']['upload'];
  sourcemapInject: RealSDK['sourcemap']['inject'];
  run: RealSDK['run'];
};

/** Fails to compile if a param type the stub declares is renamed or removed. */
type UsedParams = {
  releaseCreate: ReleaseCreateParams;
  releaseFinalize: ReleaseFinalizeParams;
  releaseSetCommits: ReleaseSetCommitsParams;
  sourcemapUpload: SourcemapUploadParams;
  sourcemapInject: SourcemapInjectParams;
  options: SentryOptions;
};

export type { UsedParams, UsedSurface };
