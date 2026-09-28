import { afterEach, describe, expect, it, vi } from 'vitest';

async function getFreshPerformanceTimeOrigin() {
  // Adding the query param with the date, forces a fresh import each time this is called
  // otherwise, the dynamic import would be cached and thus fall back to the cached value.
  const timeModule = await import(`../../../src/utils/time?update=${Date.now()}`);
  return timeModule.browserPerformanceTimeOrigin();
}

let freshImportCounter = 0;

async function getFreshTimeModule(): Promise<{
  timestampInSeconds: () => number;
  performanceTimeToSeconds: (monotonicTimeInMs: number) => number | undefined;
}> {
  // A counter rather than `Date.now()`: these tests run under fake timers, which freeze the wall clock and would
  // otherwise hand out a cached module.
  return import(`../../../src/utils/time?update=${freshImportCounter++}`);
}

async function getFreshTimestampInSeconds(): Promise<() => number> {
  return (await getFreshTimeModule()).timestampInSeconds;
}

const RELIABLE_THRESHOLD_MS = 300_000;

describe('timestampInSeconds', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('derives the timestamp from `performance.timeOrigin` and `performance.now()`', async () => {
    const currentTimeMs = 1767778040866;
    const timeSincePageloadMs = 1_234.56789;

    vi.useFakeTimers();
    vi.setSystemTime(new Date(currentTimeMs));
    vi.stubGlobal('performance', {
      timeOrigin: currentTimeMs - timeSincePageloadMs,
      now: () => timeSincePageloadMs,
    });

    const timestampInSeconds = await getFreshTimestampInSeconds();

    expect(timestampInSeconds()).toBe(currentTimeMs / 1000);
  });

  it('falls back to `Date.now()` if the performance API is unavailable', async () => {
    const currentTimeMs = 1767778040866;

    vi.useFakeTimers();
    vi.setSystemTime(new Date(currentTimeMs));
    vi.stubGlobal('performance', undefined);

    const timestampInSeconds = await getFreshTimestampInSeconds();

    expect(timestampInSeconds()).toBe(currentTimeMs / 1000);
  });

  it('keeps using `performance.timeOrigin` while the clocks agree', async () => {
    const currentTimeMs = 1767778040866;
    // Below the drift threshold, so the (inaccurate) time origin must be preserved.
    const timeOriginSkewMs = RELIABLE_THRESHOLD_MS - 2_000;

    let timeSincePageloadMs = 1_000;

    vi.useFakeTimers();
    vi.setSystemTime(new Date(currentTimeMs));
    vi.stubGlobal('performance', {
      timeOrigin: currentTimeMs - timeSincePageloadMs + timeOriginSkewMs,
      now: () => timeSincePageloadMs,
    });

    const timestampInSeconds = await getFreshTimestampInSeconds();

    expect(timestampInSeconds()).toBe((currentTimeMs + timeOriginSkewMs) / 1000);

    timeSincePageloadMs = 5_000;
    vi.setSystemTime(new Date(currentTimeMs + 4_000));

    expect(timestampInSeconds()).toBe((currentTimeMs + 4_000 + timeOriginSkewMs) / 1000);
  });

  it('re-derives the time origin once the monotonic clock drifts from the wall clock', async () => {
    const currentTimeMs = 1767778040866;
    const timeSincePageloadMs = 1_000;

    // The monotonic clock pauses during sleep, so the wall clock advances much further than it does.
    const sleepDurationMs = RELIABLE_THRESHOLD_MS + 60_000;

    vi.useFakeTimers();
    vi.setSystemTime(new Date(currentTimeMs));
    vi.stubGlobal('performance', {
      timeOrigin: currentTimeMs - timeSincePageloadMs,
      now: () => timeSincePageloadMs,
    });

    const timestampInSeconds = await getFreshTimestampInSeconds();

    expect(timestampInSeconds()).toBe(currentTimeMs / 1000);

    vi.setSystemTime(new Date(currentTimeMs + sleepDurationMs));

    expect(timestampInSeconds()).toBe((currentTimeMs + sleepDurationMs) / 1000);
  });

  it('keeps deriving elapsed time from the monotonic clock after re-deriving the time origin', async () => {
    const currentTimeMs = 1767778040866;
    const sleepDurationMs = RELIABLE_THRESHOLD_MS + 60_000;

    let timeSincePageloadMs = 1_000;

    vi.useFakeTimers();
    vi.setSystemTime(new Date(currentTimeMs));
    vi.stubGlobal('performance', {
      timeOrigin: currentTimeMs - timeSincePageloadMs,
      now: () => timeSincePageloadMs,
    });

    const timestampInSeconds = await getFreshTimestampInSeconds();

    timestampInSeconds();
    vi.setSystemTime(new Date(currentTimeMs + sleepDurationMs));
    const afterCorrection = timestampInSeconds();

    // `Date.now()` deliberately stays put while the monotonic clock advances sub-millisecond, proving the elapsed
    // time comes from `performance.now()` rather than from the coarser wall clock.
    timeSincePageloadMs += 0.25;
    expect(timestampInSeconds()).toBeCloseTo(afterCorrection + 0.25 / 1000, 10);
  });

  it('does not re-derive the time origin repeatedly once the clocks agree again', async () => {
    const currentTimeMs = 1767778040866;
    const sleepDurationMs = RELIABLE_THRESHOLD_MS + 60_000;

    let timeSincePageloadMs = 1_000;

    vi.useFakeTimers();
    vi.setSystemTime(new Date(currentTimeMs));
    vi.stubGlobal('performance', {
      timeOrigin: currentTimeMs - timeSincePageloadMs,
      now: () => timeSincePageloadMs,
    });

    const timestampInSeconds = await getFreshTimestampInSeconds();

    timestampInSeconds();
    vi.setSystemTime(new Date(currentTimeMs + sleepDurationMs));
    timestampInSeconds();

    // Advance both clocks in lockstep: the re-derived time origin must stay valid, so timestamps track the wall clock
    // exactly rather than oscillating between the two sources.
    for (let i = 1; i <= 3; i++) {
      timeSincePageloadMs += 1_000;
      vi.setSystemTime(new Date(currentTimeMs + sleepDurationMs + i * 1_000));
      expect(timestampInSeconds()).toBe((currentTimeMs + sleepDurationMs + i * 1_000) / 1000);
    }
  });

  it('follows a backwards wall clock step and stays monotonic afterwards', async () => {
    const currentTimeMs = 1767778040866;

    let timeSincePageloadMs = 1_000;

    vi.useFakeTimers();
    vi.setSystemTime(new Date(currentTimeMs));
    vi.stubGlobal('performance', {
      timeOrigin: currentTimeMs - timeSincePageloadMs,
      now: () => timeSincePageloadMs,
    });

    const timestampInSeconds = await getFreshTimestampInSeconds();

    const before = timestampInSeconds();

    // A backwards wall clock step (NTP correction, user changing the clock) beyond the threshold.
    vi.setSystemTime(new Date(currentTimeMs - RELIABLE_THRESHOLD_MS - 60_000));
    timeSincePageloadMs += 1_000;
    const afterStep = timestampInSeconds();

    // The correction itself moves the timestamp backwards, but elapsed time afterwards is still monotonic.
    timeSincePageloadMs += 1_000;
    expect(timestampInSeconds()).toBeGreaterThan(afterStep);
    expect(before).toBeGreaterThan(afterStep);
  });
});

describe('performanceTimeToSeconds', () => {
  const currentTimeMs = 1767778040866;
  const timeSincePageloadMs = 1_000;
  const sleepDurationMs = RELIABLE_THRESHOLD_MS + 60_000;

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('converts against `performance.timeOrigin` while the clocks agree', async () => {
    const timeOrigin = currentTimeMs - timeSincePageloadMs;

    vi.useFakeTimers();
    vi.setSystemTime(new Date(currentTimeMs));
    vi.stubGlobal('performance', { timeOrigin, now: () => timeSincePageloadMs });

    const { performanceTimeToSeconds } = await getFreshTimeModule();

    expect(performanceTimeToSeconds(500)).toBe((timeOrigin + 500) / 1000);
  });

  it('converts a time taken after a correction against the corrected origin', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(currentTimeMs));
    vi.stubGlobal('performance', {
      timeOrigin: currentTimeMs - timeSincePageloadMs,
      // The monotonic clock pauses during sleep, so it barely advances while the wall clock jumps ahead.
      now: () => timeSincePageloadMs,
    });

    const { performanceTimeToSeconds, timestampInSeconds } = await getFreshTimeModule();

    timestampInSeconds();
    vi.setSystemTime(new Date(currentTimeMs + sleepDurationMs));

    // Converting the current `performance.now()` must yield the same wall clock time that `timestampInSeconds`
    // reports, otherwise perf entries and spans land on diverging timelines.
    expect(performanceTimeToSeconds(timeSincePageloadMs)).toBe(timestampInSeconds());
    expect(performanceTimeToSeconds(timeSincePageloadMs)).toBe((currentTimeMs + sleepDurationMs) / 1000);
  });

  it('keeps converting a time taken before a correction against the origin that was in effect then', async () => {
    let monotonicNowMs = timeSincePageloadMs;

    vi.useFakeTimers();
    vi.setSystemTime(new Date(currentTimeMs));
    vi.stubGlobal('performance', {
      timeOrigin: currentTimeMs - timeSincePageloadMs,
      now: () => monotonicNowMs,
    });

    const { performanceTimeToSeconds, timestampInSeconds } = await getFreshTimeModule();

    // An entry observed before the drift. Its wall clock time is known exactly at this point.
    const entryStartTime = 500;
    const entryTimestampBefore = performanceTimeToSeconds(entryStartTime);
    expect(entryTimestampBefore).toBe((currentTimeMs - timeSincePageloadMs + entryStartTime) / 1000);

    // The device sleeps, the drift is detected, and the origin is re-derived.
    vi.setSystemTime(new Date(currentTimeMs + sleepDurationMs));
    monotonicNowMs += 10;
    timestampInSeconds();

    // Converting the same entry now must not retroactively shift it by the drift.
    expect(performanceTimeToSeconds(entryStartTime)).toBe(entryTimestampBefore);
  });

  it('converts times on either side of a correction against their respective origins', async () => {
    let monotonicNowMs = timeSincePageloadMs;

    vi.useFakeTimers();
    vi.setSystemTime(new Date(currentTimeMs));
    vi.stubGlobal('performance', {
      timeOrigin: currentTimeMs - timeSincePageloadMs,
      now: () => monotonicNowMs,
    });

    const { performanceTimeToSeconds, timestampInSeconds } = await getFreshTimeModule();

    // The last check at which both clocks still agreed is where the corrected origin starts to apply.
    const lastAgreedCheckMs = monotonicNowMs;
    timestampInSeconds();

    const monotonicAdvanceMs = 10;
    vi.setSystemTime(new Date(currentTimeMs + sleepDurationMs));
    monotonicNowMs += monotonicAdvanceMs;
    timestampInSeconds();

    const beforeCorrection = performanceTimeToSeconds(lastAgreedCheckMs - 1) as number;
    const afterCorrection = performanceTimeToSeconds(lastAgreedCheckMs + 1) as number;

    // The two are 2ms apart on the monotonic clock, but the origins they resolve to are a whole sleep apart: the wall
    // clock advanced `sleepDurationMs` while the monotonic clock only advanced `monotonicAdvanceMs`.
    const driftMs = sleepDurationMs - monotonicAdvanceMs;
    expect(afterCorrection - beforeCorrection).toBeCloseTo((driftMs + 2) / 1000, 6);
  });

  it('converts the interaction that wakes the SDK up after a sleep against the corrected origin', async () => {
    let monotonicNowMs = timeSincePageloadMs;

    vi.useFakeTimers();
    vi.setSystemTime(new Date(currentTimeMs));
    vi.stubGlobal('performance', {
      timeOrigin: currentTimeMs - timeSincePageloadMs,
      now: () => monotonicNowMs,
    });

    const { performanceTimeToSeconds, timestampInSeconds } = await getFreshTimeModule();

    timestampInSeconds();

    // After waking up, the user clicks. The click's entry starts when the input arrives, the SDK only notices the
    // drift a few milliseconds later, while handling that click.
    vi.setSystemTime(new Date(currentTimeMs + sleepDurationMs));
    const clickStartTime = (monotonicNowMs += 10);
    monotonicNowMs += 5;
    vi.setSystemTime(new Date(currentTimeMs + sleepDurationMs + 5));
    const detectedAt = timestampInSeconds();

    expect(performanceTimeToSeconds(clickStartTime)).toBeCloseTo(detectedAt - 0.005, 6);
  });

  it('keeps the page load origin once the number of remembered corrections is exceeded', async () => {
    let monotonicNowMs = timeSincePageloadMs;
    let wallNowMs = currentTimeMs;
    const timeOrigin = currentTimeMs - timeSincePageloadMs;

    vi.useFakeTimers();
    vi.setSystemTime(new Date(wallNowMs));
    vi.stubGlobal('performance', { timeOrigin, now: () => monotonicNowMs });

    const { browserPerformanceTimeOrigin, timestampInSeconds } = await getFreshTimeModule();

    timestampInSeconds();
    for (let i = 0; i < 40; i++) {
      monotonicNowMs += 1_000;
      wallNowMs += 1_000 + sleepDurationMs;
      vi.setSystemTime(new Date(wallNowMs));
      timestampInSeconds();
    }

    expect(browserPerformanceTimeOrigin()).toBe(timeOrigin);
    expect(browserPerformanceTimeOrigin(monotonicNowMs)).toBe(wallNowMs - monotonicNowMs);
  });

  it('converts times preceding the oldest known origin against that origin', async () => {
    const timeOrigin = currentTimeMs - timeSincePageloadMs;

    vi.useFakeTimers();
    vi.setSystemTime(new Date(currentTimeMs));
    vi.stubGlobal('performance', { timeOrigin, now: () => timeSincePageloadMs });

    const { performanceTimeToSeconds } = await getFreshTimeModule();

    expect(performanceTimeToSeconds(0)).toBe(timeOrigin / 1000);
  });

  it('never converts against a `performance.timeOrigin` that was already unreliable at startup', async () => {
    // Some browsers report a bogus `performance.timeOrigin`. It never described a real point in time, so no monotonic
    // time should ever be converted against it — not even one measured before the SDK first looked at the clock.
    const timeOriginSkewMs = RELIABLE_THRESHOLD_MS + 60_000;

    vi.useFakeTimers();
    vi.setSystemTime(new Date(currentTimeMs));
    vi.stubGlobal('performance', {
      timeOrigin: currentTimeMs - timeSincePageloadMs + timeOriginSkewMs,
      now: () => timeSincePageloadMs,
    });

    const { performanceTimeToSeconds } = await getFreshTimeModule();

    expect(performanceTimeToSeconds(0)).toBe((currentTimeMs - timeSincePageloadMs) / 1000);
  });

  it('converts against `Date.now() - performance.now()` if `performance.timeOrigin` is not available', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(currentTimeMs));
    vi.stubGlobal('performance', { timeOrigin: undefined, now: () => timeSincePageloadMs });

    const { performanceTimeToSeconds } = await getFreshTimeModule();

    expect(performanceTimeToSeconds(500)).toBe((currentTimeMs - timeSincePageloadMs + 500) / 1000);
  });

  it('returns `undefined` if the performance API is unavailable', async () => {
    vi.stubGlobal('performance', undefined);

    const { performanceTimeToSeconds } = await getFreshTimeModule();

    expect(performanceTimeToSeconds(500)).toBeUndefined();
  });
});

describe('browserPerformanceTimeOrigin', () => {
  it('returns `performance.timeOrigin` if it is available and reliable', async () => {
    const timeOrigin = await getFreshPerformanceTimeOrigin();
    expect(timeOrigin).toBeDefined();
    expect(timeOrigin).toBeGreaterThan(0);
    expect(timeOrigin).toBeLessThan(Date.now());
    expect(timeOrigin).toBe(performance.timeOrigin);
  });

  it('returns `undefined` if `performance.now` is not available', async () => {
    vi.stubGlobal('performance', undefined);

    const timeOrigin = await getFreshPerformanceTimeOrigin();
    expect(timeOrigin).toBeUndefined();

    vi.unstubAllGlobals();
  });

  it('returns `Date.now() - performance.now()` if `performance.timeOrigin` is not reliable', async () => {
    const currentTimeMs = 1767778040866;

    const unreliableTime = currentTimeMs - RELIABLE_THRESHOLD_MS - 2_000;

    const timeSincePageloadMs = 1_234.56789;

    vi.useFakeTimers();
    vi.setSystemTime(new Date(currentTimeMs));

    vi.stubGlobal('performance', {
      timeOrigin: unreliableTime,
      now: () => timeSincePageloadMs,
    });

    const timeOrigin = await getFreshPerformanceTimeOrigin();
    expect(timeOrigin).toBe(currentTimeMs - timeSincePageloadMs);

    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('returns `Date.now() - performance.now()` if `performance.timeOrigin` is not available', async () => {
    const currentTimeMs = 1767778040866;

    const timeSincePageloadMs = 1_234.56789;

    vi.useFakeTimers();
    vi.setSystemTime(new Date(currentTimeMs));
    vi.stubGlobal('performance', {
      timeOrigin: undefined,
      now: () => timeSincePageloadMs,
    });

    const timeOrigin = await getFreshPerformanceTimeOrigin();
    expect(timeOrigin).toBe(currentTimeMs - timeSincePageloadMs);

    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe('caching', () => {
    it('caches `undefined` result', async () => {
      vi.stubGlobal('performance', undefined);

      const timeModule = await import(`../../../src/utils/time?update=${Date.now()}`);

      const result1 = timeModule.browserPerformanceTimeOrigin();

      expect(result1).toBeUndefined();

      vi.stubGlobal('performance', {
        timeOrigin: 1000,
        now: () => 100,
      });

      const result2 = timeModule.browserPerformanceTimeOrigin();
      expect(result2).toBeUndefined(); // Should still be undefined due to caching

      vi.unstubAllGlobals();
    });

    it('caches `number` result', async () => {
      const timeModule = await import(`../../../src/utils/time?update=${Date.now()}`);
      const result = timeModule.browserPerformanceTimeOrigin();
      const timeOrigin = performance.timeOrigin;
      expect(result).toBe(timeOrigin);

      vi.stubGlobal('performance', {
        now: undefined,
      });

      const result2 = timeModule.browserPerformanceTimeOrigin();
      expect(result2).toBe(timeOrigin);

      vi.unstubAllGlobals();
    });
  });
});
