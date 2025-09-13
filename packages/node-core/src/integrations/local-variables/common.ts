import type { Debugger } from 'node:inspector';

export type Variables = Record<string, unknown>;

export type RateLimitIncrement = () => void;

/**
 * The key used to store the local variables on the error object.
 */
export const LOCAL_VARIABLES_KEY = '__SENTRY_ERROR_LOCAL_VARIABLES__';

/**
 * Creates a rate limiter that will call the disable callback when the rate limit is reached and the enable callback
 * when a timeout has occurred.
 * @param maxPerSecond Maximum number of calls per second
 * @param enable Callback to enable capture
 * @param disable Callback to disable capture
 * @returns A function to call to increment the rate limiter count
 */
export function createRateLimiter(
  maxPerSecond: number,
  enable: () => void,
  disable: (seconds: number) => void,
): RateLimitIncrement {
  let count = 0;
  let retrySeconds = 5;
  let disabledTimeout = 0;

  setInterval(() => {
    if (disabledTimeout === 0) {
      if (count > maxPerSecond) {
        retrySeconds *= 2;
        disable(retrySeconds);

        // Cap at one day
        if (retrySeconds > 86400) {
          retrySeconds = 86400;
        }
        disabledTimeout = retrySeconds;
      }
    } else {
      disabledTimeout -= 1;

      if (disabledTimeout === 0) {
        enable();
      }
    }

    count = 0;
  }, 1_000).unref();

  return () => {
    count += 1;
  };
}

// Add types for the exception event data
export type PausedExceptionEvent = Debugger.PausedEventDataType & {
  data: {
    // This contains error.stack
    description: string;
    objectId?: string;
  };
};

/** Could this be an anonymous function? */
export function isAnonymous(name: string | undefined): boolean {
  return name !== undefined && (name.length === 0 || name === '?' || name === '<anonymous>');
}

/** Do the function names appear to match? */
export function functionNamesMatch(a: string | undefined, b: string | undefined): boolean {
  return a === b || `Object.${a}` === b || a === `Object.${b}` || (isAnonymous(a) && isAnonymous(b));
}

export interface FrameVariables {
  function: string;
  vars?: Variables;
}

export interface LocalVariablesIntegrationOptions {
  /**
   * Capture local variables for both caught and uncaught exceptions
   *
   * - When false, only uncaught exceptions will have local variables
   * - When true, both caught and uncaught exceptions will have local variables.
   *
   * Defaults to `true`.
   *
   * Capturing local variables for all exceptions can be expensive since the debugger pauses for every throw to collect
   * local variables.
   *
   * To reduce the likelihood of this feature impacting app performance or throughput, this feature is rate-limited.
   * Once the rate limit is reached, local variables will only be captured for uncaught exceptions until a timeout has
   * been reached.
   */
  captureAllExceptions?: boolean;
  /**
   * Maximum number of exceptions to capture local variables for per second before rate limiting is triggered.
   */
  maxExceptionsPerSecond?: number;
  /**
   * When true, local variables will be captured for all frames, including those that are not in_app.
   *
   * Defaults to `false`.
   */
  includeOutOfAppFrames?: boolean;
}

export interface LocalVariablesWorkerArgs extends LocalVariablesIntegrationOptions {
  /**
   * Whether to enable debug logging.
   */
  debug: boolean;
  /**
   * Base path used to calculate module name.
   *
   * Defaults to `dirname(process.argv[1])` and falls back to `process.cwd()`
   */
  basePath?: string;
}
