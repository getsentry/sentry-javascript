/**
 * Types for the recording stub, taken from the real CLI rather than restated here.
 *
 * The stub used to declare its params as `Record<string, unknown>`, which accepted anything: a
 * param the CLI had renamed, or one it never had, still produced a green snapshot. Importing the
 * real types means the build plugin's calls are checked against the CLI's actual surface, so
 * drift fails `check:types` instead of silently passing.
 *
 * This only covers the arguments going in. How the stub turns them into the recorded CLI-style
 * argv is its own invention and cannot be checked this way - see the adapter's contract test,
 * which runs those same calls against the real CLI.
 */
import type {
  ReleaseCreateParams,
  ReleaseFinalizeParams,
  ReleaseSetCommitsParams,
  SentryOptions,
  SourcemapInjectParams,
  SourcemapUploadParams,
} from 'sentry';

export type { SentryOptions };

export type SentrySDK = {
  release: {
    create(params?: ReleaseCreateParams): Promise<unknown>;
    finalize(params?: ReleaseFinalizeParams): Promise<unknown>;
    'set-commits'(params?: ReleaseSetCommitsParams): Promise<unknown>;
  };
  sourcemap: {
    upload(params?: SourcemapUploadParams): Promise<unknown>;
    inject(params?: SourcemapInjectParams): Promise<unknown>;
  };
  run(...args: string[]): Promise<unknown>;
};

declare function createSentrySDK(options?: SentryOptions): SentrySDK;

export default createSentrySDK;
