import { safeDateNow, withRandomSafeContext } from './randomSafeContext';
import { GLOBAL_OBJ } from './worldwide';

const ONE_SECOND_IN_MS = 1000;

/**
 * If `performance.timeOrigin + performance.now()` and `Date.now()` differ by more than this, we correct the time origin.
 */
const CLOCK_DRIFT_THRESHOLD_MS = 1_000;

/**
 * Max number of time origins we store. When we hit it, we drop the oldest one, except the page load origin, which
 * the pageload span uses.
 */
const MAX_TIME_ORIGIN_SEGMENTS = 100;

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
 * When we correct the time origin, we keep the old ones. This way, a `performance.now()` value can be converted with the
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
      // both cases `timeOrigin + performance.now()` no longer matches `Date.now()`, so we correct the time origin.
      // We still use `performance.now()` for elapsed time to keep sub-millisecond precision.
      // See: https://github.com/getsentry/sentry-javascript/issues/2590
      // See: https://github.com/mdn/content/issues/4713
      // See: https://dev.to/noamr/when-a-millisecond-is-not-a-millisecond-3h6
      if (Math.abs(correctedTimeOrigin + performanceNow - dateNow) > CLOCK_DRIFT_THRESHOLD_MS) {
        correctedTimeOrigin = dateNow - performanceNow;

        if (isFirstCall) {
          // `performance.timeOrigin` was already wrong at startup, so we replace it. If we pushed a second segment
          // instead, the segment cap below could later drop the corrected one and keep the wrong one.
          _timeOriginSegments = [{ from: 0, origin: correctedTimeOrigin }];
        } else {
          // We keep the old origins, so performance entries recorded before the correction still use their origin.
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
let _checkedForDriftInThisTask = false;

/**
 * Converts a `performance.now()` based, relative time in milliseconds (e.g. a `PerformanceEntry`'s `startTime`)
 * to a UNIX timestamp in seconds, matching {@link timestampInSeconds}.
 *
 * Corrects for clock drift via browserPerformanceTimeOrigin().
 *
 * Pass `entryStartTimeInMs` (also a `performance.now()` based time) to use the time origin that was valid at the entry's
 * start. Use it for all timings of one entry, so its duration stays correct.
 *
 * Returns `undefined` if the Performance API is unavailable.
 */
export function performanceTimeToSeconds(
  monotonicTimeInMs: number,
  entryStartTimeInMs = monotonicTimeInMs,
): number | undefined {
  const origin = browserPerformanceTimeOrigin(entryStartTimeInMs);
  return origin == null ? undefined : (origin + monotonicTimeInMs) / ONE_SECOND_IN_MS;
}

/**
 * Returns a timestamp in seconds since the UNIX epoch using either the Performance or Date APIs, depending on the
 * availability of the Performance API.
 *
 * If the Performance API time and `Date.now()` differ by more than {@link CLOCK_DRIFT_THRESHOLD_MS} (e.g. after the
 * device slept), the time origin is corrected based on `Date.now()`.
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
  // Checks for drift (and sets up `_timeOriginSegments`), so entries recorded after a sleep get the corrected origin.
  // To avoid the expensive clock drift check on every call, we only do it once per task. Helps mitigating performance
  // overhead in loops over many entries (e.g. browser profiling `convertToContinuousProfile`).
  if (!_checkedForDriftInThisTask) {
    _checkedForDriftInThisTask = true;
    // We use a promise instead of `queueMicrotask`, because React Native < 0.66 doesn't have it.
    void Promise.resolve().then(() => {
      _checkedForDriftInThisTask = false;
    });
    timestampInSeconds();
  }

  let segment: TimeOriginSegment | undefined;
  for (const candidate of _timeOriginSegments) {
    if (segment && candidate.from > monotonicTimeInMs) {
      break;
    }
    segment = candidate;
  }

  return segment?.origin;
}
