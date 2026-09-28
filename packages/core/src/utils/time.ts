import { safeDateNow, withRandomSafeContext } from './randomSafeContext';
import { GLOBAL_OBJ } from './worldwide';

const ONE_SECOND_IN_MS = 1000;

/**
 * Maximum tolerated difference between the monotonic clock and the wall clock before we consider
 * the monotonic clock's time origin stale.
 */
const CLOCK_DRIFT_THRESHOLD_MS = 300_000; // 5 minutes in milliseconds

/**
 * Upper bound on the number of drift corrections {@link browserPerformanceTimeOrigin} remembers. A page has to survive
 * that many separate clock jumps to reach it, so the cap only keeps a pathological clock from growing the list without
 * bound. Once reached, the oldest corrections are merged away. The origin at page load is always kept, because the
 * pageload span and its children are anchored to it.
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
 * A stretch of the monotonic clock's timeline and the wall clock time its zero maps to.
 *
 * The monotonic→wall mapping is piecewise: a drift correction replaces the origin from that point on, but leaves the
 * mapping for everything that came before it intact. Keeping the superseded origins around lets a monotonic timestamp
 * be converted against the origin that was in effect when the timestamp was taken, rather than the one in effect when
 * the conversion happens to run.
 */
interface TimeOriginSegment {
  /** The `performance.now()` value from which `origin` applies. */
  from: number;
  /** Milliseconds since the UNIX epoch that `performance.now() === 0` corresponds to. */
  origin: number;
}

/**
 * Time origins in effect over the lifetime of the page, oldest first. Empty until the first `timestampInSeconds` call,
 * and whenever the Performance API is unavailable.
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
      // Monotonic times can still be converted, just without drift correction.
      _timeOriginSegments = [{ from: 0, origin: safeDateNow() - withRandomSafeContext(() => performance.now()) }];
    }
    return dateTimestampInSeconds;
  }

  // performance.now() is a monotonic clock, which means it starts at 0 when the process begins. To get the current
  // wall clock time (actual UNIX timestamp), we need to add the starting time origin and the current time elapsed.
  let timeOrigin = performance.timeOrigin;
  _timeOriginSegments = [{ from: 0, origin: timeOrigin }];
  let isFirstCall = true;
  let lastCheckedPerformanceNow = 0;

  return () => {
    return withRandomSafeContext(() => {
      const performanceNow = performance.now();
      const dateNow = Date.now();

      // `timeOrigin + performance.now()` only equals wall clock time for as long as both clocks advance in lockstep.
      // performance.now() stops advancing while the device is asleep, so it under-counts elapsed wall time; conversely
      // the wall clock itself can be stepped by Network Time Protocol (NTP) or the user. Either way the two drift apart
      // by arbitrary amounts. Re-deriving the origin restores absolute accuracy while still taking elapsed time from
      // the monotonic clock, so durations keep sub-millisecond precision.
      // Timestamps taken before a correction are measured against a different origin than those taken after it, so a
      // span that starts before one and ends after it absorbs the drift into its duration. If the wall clock was stepped
      // backwards, that duration can even be negative. Spans that lie entirely on one side of a correction are
      // unaffected.
      // See: https://github.com/getsentry/sentry-javascript/issues/2590
      // See: https://github.com/mdn/content/issues/4713
      // See: https://dev.to/noamr/when-a-millisecond-is-not-a-millisecond-3h6
      if (Math.abs(timeOrigin + performanceNow - dateNow) > CLOCK_DRIFT_THRESHOLD_MS) {
        timeOrigin = dateNow - performanceNow;
        // The very first check runs before any timestamp has been handed out, so a `performance.timeOrigin` that was
        // already unreliable at startup never applied to anything and is replaced outright.
        // Later corrections apply from the previous check on, the last point the clocks were known to agree. Drift is
        // usually only noticed when an interaction wakes the SDK up again, and the entry for that interaction starts
        // slightly before the check that detects it, so it has to be on the corrected side. The cost is that entries
        // recorded between that previous check and the device going to sleep are shifted by the drift.
        if (isFirstCall) {
          _timeOriginSegments = [{ from: 0, origin: timeOrigin }];
        } else {
          _timeOriginSegments.push({ from: lastCheckedPerformanceNow, origin: timeOrigin });
          if (_timeOriginSegments.length > MAX_TIME_ORIGIN_SEGMENTS) {
            _timeOriginSegments.splice(1, 1);
          }
        }
      }
      isFirstCall = false;
      lastCheckedPerformanceNow = performanceNow;

      return (timeOrigin + performanceNow) / ONE_SECOND_IN_MS;
    });
  };
}

let _cachedTimestampInSeconds: (() => number) | undefined;

/**
 * Converts a monotonic time from the Performance API (a `PerformanceEntry`'s `startTime`, a profiler sample's
 * `timestamp`, or any other `performance.now()`-relative value in milliseconds) to a wall clock timestamp in seconds
 * since the UNIX epoch, on the same timeline as {@link timestampInSeconds}.
 *
 * Returns `undefined` if the Performance API is unavailable, in which case monotonic times cannot be converted at all.
 */
export function performanceTimeToSeconds(monotonicTimeInMs: number): number | undefined {
  const origin = browserPerformanceTimeOrigin(monotonicTimeInMs);
  return origin === undefined ? undefined : (origin + monotonicTimeInMs) / ONE_SECOND_IN_MS;
}

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
 * Returns the time origin (milliseconds since the UNIX epoch that `performance.now() === 0` corresponds to) that was in
 * effect at the given monotonic time, which defaults to the page load.
 *
 * Because the SDK re-derives its time origin when the monotonic and wall clocks drift apart, a single origin is only
 * valid for part of the page's lifetime. Pass the monotonic time that is being converted, so that entries reported long
 * after the fact (INP on pagehide, replay entries buffered until flush) are not shifted by a drift that happened after
 * they were recorded. Use the same time for every timing of one entry, so its duration stays intact.
 *
 * Returns `undefined` if the Performance API is unavailable.
 */
export function browserPerformanceTimeOrigin(monotonicTimeInMs = 0): number | undefined {
  // Segments are only populated once `timestampInSeconds` has resolved which clock source to use.
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
