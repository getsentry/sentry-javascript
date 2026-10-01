import { safeDateNow, withRandomSafeContext } from './randomSafeContext';
import { GLOBAL_OBJ } from './worldwide';

const ONE_SECOND_IN_MS = 1000;

/**
 * If `performance.timeOrigin + performance.now()` and `Date.now()` differ by more than this, we reset the time origin.
 */
const CLOCK_DRIFT_THRESHOLD_MS = 1_000;

/**
 * Max number of time origins we store. When we hit it, we drop the oldest one, except the page load origin, which
 * the pageload span uses.
 */
const MAX_TIME_ORIGIN_SEGMENTS = 30;

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
 * A time origin and the `performance.now()` value from which it applies.
 *
 * When we reset the time origin, we keep the old ones. This way, a `performance.now()` value can be converted with the
 * origin that was valid when it was measured, not the one that is valid now.
 */
interface TimeOriginSegment {
  /** The `performance.now()` value from which `origin` applies. */
  from: number;
  /** Milliseconds since the UNIX epoch that `performance.now() === 0` corresponds to. */
  origin: number;
}

/**
 * All time origins of the page, oldest first. Empty until the first `timestampInSeconds` call, or if the Performance
 * API is unavailable.
 */
let _timeOriginSegments: TimeOriginSegment[] = [];

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
    if (performance?.now) {
      // We can still convert `performance.now()` values, just without drift correction.
      _timeOriginSegments = [{ from: 0, origin: safeDateNow() - withRandomSafeContext(() => performance.now()) }];
    }
    return dateTimestampInSeconds;
  }

  // performance.now() is a monotonic clock, which means it starts at 0 when the process begins. To get the current
  // wall clock time (actual UNIX timestamp), we need to add the starting time origin and the current time elapsed.
  // Due to device sleeps, the origin might need to be corrected to match the wall clock time over the SDK's lifetime.
  let correctedTimeOrigin = performance.timeOrigin;
  _timeOriginSegments = [{ from: 0, origin: correctedTimeOrigin }];
  let isFirstCall = true;
  let lastCheckedPerformanceNow = 0;

  return () => {
    return withRandomSafeContext(() => {
      const performanceNow = performance.now();
      const dateNow = Date.now();

      // `performance.now()` stops while the device sleeps, and the wall clock can be changed by NTP or the user. In
      // both cases `timeOrigin + performance.now()` no longer matches `Date.now()`, so we reset the time origin.
      // We still use `performance.now()` for elapsed time to keep sub-millisecond precision.
      // See: https://github.com/getsentry/sentry-javascript/issues/2590
      // See: https://github.com/mdn/content/issues/4713
      // See: https://dev.to/noamr/when-a-millisecond-is-not-a-millisecond-3h6
      if (Math.abs(correctedTimeOrigin + performanceNow - dateNow) > CLOCK_DRIFT_THRESHOLD_MS) {
        correctedTimeOrigin = dateNow - performanceNow;

        // after correcting the timeOrigin, we add an entry to _timeOriginSegments so that we
        // can track when we made the correction. This is relevant for telemetry collected from
        // performance entries that hold uncorrected time values. Used in browserPerformanceTimeOrigin return
        // a corrected time origin value.
        if (isFirstCall) {
          // special case: We detect clock drift right away (basically at SDK init time), so we replace
          // the initial _timeOriginSegments entry with the corrected value.
          _timeOriginSegments = [{ from: 0, origin: correctedTimeOrigin }];
        } else {
          _timeOriginSegments.push({ from: lastCheckedPerformanceNow, origin: correctedTimeOrigin });
          if (_timeOriginSegments.length > MAX_TIME_ORIGIN_SEGMENTS) {
            // we keep the oldest entry (the page load origin) and drop the one after it.
            _timeOriginSegments.splice(1, 1);
          }
        }
      }
      isFirstCall = false;
      lastCheckedPerformanceNow = performanceNow;

      return (correctedTimeOrigin + performanceNow) / ONE_SECOND_IN_MS;
    });
  };
}

let _cachedTimestampInSecondsFn: (() => number) | undefined;

/**
 * Converts a `performance.now()` based, relative time in milliseconds (e.g. a `PerformanceEntry`'s `startTime`)
 * to a UNIX timestamp in seconds, matching {@link timestampInSeconds}.
 *
 * This also corrects for clock drift via browserPerformanceTimeOrigin().
 *
 * Returns `undefined` if the Performance API is unavailable.
 */
export function performanceTimeToSeconds(monotonicTimeInMs: number): number | undefined {
  const origin = browserPerformanceTimeOrigin(monotonicTimeInMs);
  return origin === undefined ? undefined : (origin + monotonicTimeInMs) / ONE_SECOND_IN_MS;
}

/**
 * Returns a timestamp in seconds since the UNIX epoch using either the Performance or Date APIs, depending on the
 * availability of the Performance API.
 *
 * If the Performance API time and `Date.now()` differ by more than {@link CLOCK_DRIFT_THRESHOLD_MS} (e.g. after the
 * device slept), the time origin is reset based on `Date.now()`.
 * See https://github.com/getsentry/sentry-javascript/issues/2590.
 */
export function timestampInSeconds(): number {
  // We store this in a closure so that we don't have to create a new function every time this is called.
  const func = _cachedTimestampInSecondsFn ?? (_cachedTimestampInSecondsFn = createUnixTimestampInSecondsFunc());
  return func();
}

/**
 * Returns the time origin in milliseconds that was valid at the given `performance.now()` time. Defaults to the page
 * load origin.
 *
 * Pass the time you want to convert, so entries that are reported late (e.g. INP on pagehide) are not shifted by a
 * drift that happened after they were recorded. Use the same time for all timings of one entry to keep its duration.
 *
 * Returns `undefined` if the Performance API is unavailable.
 */
export function browserPerformanceTimeOrigin(monotonicTimeInMs = 0): number | undefined {
  // Makes sure `_timeOriginSegments` is set up.
  timestampInSeconds();

  let segment: TimeOriginSegment | undefined;
  for (const candidate of _timeOriginSegments) {
    if (segment && candidate.from > monotonicTimeInMs) {
      break;
    }
    segment = candidate;
  }

  return segment?.origin;
}
