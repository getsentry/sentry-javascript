import { safeDateNow, withRandomSafeContext } from './randomSafeContext';
import { GLOBAL_OBJ } from './worldwide';

const ONE_SECOND_IN_MS = 1000;

/**
 * Maximum tolerated difference between the monotonic clock and the wall clock before we consider
 * the monotonic clock's time origin stale.
 */
const CLOCK_DRIFT_THRESHOLD_MS = 300_000; // 5 minutes in milliseconds

/**
 * A partial definition of the [Performance Web API]{@link https://developer.mozilla.org/en-US/docs/Web/API/Performance}
 * for accessing a high-resolution monotonic clock.
 */
interface Performance {
  /**
   * The millisecond timestamp at which measurement began, measured in Unix time.
   */
  timeOrigin: number;
  /**
   * Returns the current millisecond timestamp, where 0 represents the start of measurement.
   */
  now(): number;
}

/**
 * Returns a timestamp in seconds since the UNIX epoch using the Date API.
 */
export function dateTimestampInSeconds(): number {
  return safeDateNow() / ONE_SECOND_IN_MS;
}

/**
 * Returns a wrapper around the native Performance API browser implementation, or undefined for browsers that do not
 * support the API.
 *
 * Wrapping the native API works around differences in behavior from different browsers.
 */
function createUnixTimestampInSecondsFunc(): () => number {
  const { performance } = GLOBAL_OBJ as typeof GLOBAL_OBJ & { performance?: Performance };
  // Some browser and environments don't have a performance or timeOrigin, so we fallback to
  // using Date.now() to compute the starting time.
  if (!performance?.now || !performance.timeOrigin) {
    return dateTimestampInSeconds;
  }

  // performance.now() is a monotonic clock, which means it starts at 0 when the process begins. To get the current
  // wall clock time (actual UNIX timestamp), we need to add the starting time origin and the current time elapsed.
  let timeOrigin = performance.timeOrigin;

  return () => {
    return withRandomSafeContext(() => {
      const performanceNow = performance.now();
      const dateNow = Date.now();

      // `timeOrigin + performance.now()` only equals wall clock time for as long as both clocks advance in lockstep.
      // performance.now() stops advancing while the device is asleep, so it under-counts elapsed wall time; conversely
      // the wall clock itself can be stepped by Network Time Protocol (NTP) or the user. Either way the two drift apart
      // by arbitrary amounts. Re-deriving the origin restores absolute accuracy while still taking elapsed time from
      // the monotonic clock, so durations keep sub-millisecond precision and cannot run backwards.
      // Timestamps taken before a correction are measured against a different origin than those taken after it, so a
      // span that starts before one and ends after it absorbs the drift into its duration. Spans that lie entirely on
      // one side of a correction are unaffected.
      // See: https://github.com/getsentry/sentry-javascript/issues/2590
      // See: https://github.com/mdn/content/issues/4713
      // See: https://dev.to/noamr/when-a-millisecond-is-not-a-millisecond-3h6
      if (Math.abs(timeOrigin + performanceNow - dateNow) > CLOCK_DRIFT_THRESHOLD_MS) {
        timeOrigin = dateNow - performanceNow;
      }

      return (timeOrigin + performanceNow) / ONE_SECOND_IN_MS;
    });
  };
}

let _cachedTimestampInSeconds: (() => number) | undefined;

/**
 * Returns a timestamp in seconds since the UNIX epoch using either the Performance or Date APIs, depending on the
 * availability of the Performance API.
 *
 * Because the Performance API's clock and the wall clock can drift apart (the former stops while the computer is
 * asleep, the latter can be stepped by NTP or the user), the time origin they are combined against is re-derived from
 * `Date.now()` whenever the two disagree by more than {@link CLOCK_DRIFT_THRESHOLD_MS}. Two timestamps taken on either
 * side of such a correction are skewed relative to each other by the amount of drift, so a span that starts before a
 * correction and ends after it reports the wall clock time elapsed rather than the time the monotonic clock was
 * running. See https://github.com/getsentry/sentry-javascript/issues/2590.
 */
export function timestampInSeconds(): number {
  // We store this in a closure so that we don't have to create a new function every time this is called.
  const func = _cachedTimestampInSeconds ?? (_cachedTimestampInSeconds = createUnixTimestampInSecondsFunc());
  return func();
}

/**
 * Cached result of getBrowserTimeOrigin.
 */
let cachedTimeOrigin: number | null | undefined = null;

/**
 * Gets the time origin and the mode used to determine it.
 *
 * Unfortunately browsers may report inaccurate time origin data through performance.timeOrigin,
 * which results in poor results in performance data. We only treat time origin data as reliable
 * if it is within a reasonable threshold of the current time.
 *
 * TODO: move to `@sentry/browser-utils` package.
 */
function getBrowserTimeOrigin(): number | undefined {
  const { performance } = GLOBAL_OBJ as typeof GLOBAL_OBJ & Window;
  if (!performance?.now) {
    return undefined;
  }

  const performanceNow = withRandomSafeContext(() => performance.now());
  const dateNow = safeDateNow();

  const timeOrigin = performance.timeOrigin;
  if (typeof timeOrigin === 'number') {
    const timeOriginDelta = Math.abs(timeOrigin + performanceNow - dateNow);
    if (timeOriginDelta < CLOCK_DRIFT_THRESHOLD_MS) {
      return timeOrigin;
    }
  }

  // timeOrigin is skewed or unavailable, fallback to subtracting
  // `performance.now()` from `Date.now()`.
  return dateNow - performanceNow;
}

/**
 * The number of milliseconds since the UNIX epoch. This value is only usable in a browser, and only when the
 * performance API is available.
 */
export function browserPerformanceTimeOrigin(): number | undefined {
  if (cachedTimeOrigin === null) {
    cachedTimeOrigin = getBrowserTimeOrigin();
  }

  return cachedTimeOrigin;
}
