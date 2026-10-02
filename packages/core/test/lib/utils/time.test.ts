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
  // We use a counter instead of `Date.now()` because fake timers freeze `Date.now()`, which would return a cached
  // module.
  return import(`../../../src/utils/time?update=${freshImportCounter++}`);
}

async function getFreshTimestampInSeconds(): Promise<() => number> {
  return (await getFreshTimeModule()).timestampInSeconds;
}

const RELIABLE_THRESHOLD_MS = 1_000;

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
    // Below the drift threshold, so we keep the (wrong) time origin.
    const timeOriginSkewMs = RELIABLE_THRESHOLD_MS - 200;

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

  it('corrects the time origin when `performance.now()` drifts from `Date.now()`', async () => {
    const currentTimeMs = 1767778040866;
    const timeSincePageloadMs = 1_000;

    // `performance.now()` stops during sleep, so `Date.now()` moves much further.
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

  it('still uses `performance.now()` for elapsed time after a time origin correction', async () => {
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

    // `Date.now()` stays the same while `performance.now()` moves by less than 1ms. This shows that elapsed time
    // comes from `performance.now()`.
    timeSincePageloadMs += 0.25;
    expect(timestampInSeconds()).toBeCloseTo(afterCorrection + 0.25 / 1000, 10);
  });

  it('does not correct the time origin again once the clocks agree', async () => {
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

    // Move both clocks by the same amount. The new time origin should stay in use.
    for (let i = 1; i <= 3; i++) {
      timeSincePageloadMs += 1_000;
      vi.setSystemTime(new Date(currentTimeMs + sleepDurationMs + i * 1_000));
      expect(timestampInSeconds()).toBe((currentTimeMs + sleepDurationMs + i * 1_000) / 1000);
    }
  });

  it('follows a backwards wall clock jump and keeps counting up afterwards', async () => {
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

    // The wall clock jumps backwards by more than the threshold (e.g. NTP or the user changed it).
    vi.setSystemTime(new Date(currentTimeMs - RELIABLE_THRESHOLD_MS - 60_000));
    timeSincePageloadMs += 1_000;
    const afterStep = timestampInSeconds();

    // The correction moves the timestamp backwards once, but after that it counts up again.
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

  it('converts a time after a correction with the new time origin', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(currentTimeMs));
    vi.stubGlobal('performance', {
      timeOrigin: currentTimeMs - timeSincePageloadMs,
      // `performance.now()` stops during sleep, so it barely moves while `Date.now()` jumps ahead.
      now: () => timeSincePageloadMs,
    });

    const { performanceTimeToSeconds, timestampInSeconds } = await getFreshTimeModule();

    timestampInSeconds();
    vi.setSystemTime(new Date(currentTimeMs + sleepDurationMs));

    // Converting the current `performance.now()` must return the same time as `timestampInSeconds`. Otherwise,
    // performance entries and spans would not line up.
    expect(performanceTimeToSeconds(timeSincePageloadMs)).toBe(timestampInSeconds());
    expect(performanceTimeToSeconds(timeSincePageloadMs)).toBe((currentTimeMs + sleepDurationMs) / 1000);
  });

  it('converts a time before a correction with the old time origin', async () => {
    let monotonicNowMs = timeSincePageloadMs;

    vi.useFakeTimers();
    vi.setSystemTime(new Date(currentTimeMs));
    vi.stubGlobal('performance', {
      timeOrigin: currentTimeMs - timeSincePageloadMs,
      now: () => monotonicNowMs,
    });

    const { performanceTimeToSeconds, timestampInSeconds } = await getFreshTimeModule();

    // An entry recorded before the drift.
    const entryStartTime = 500;
    const entryTimestampBefore = performanceTimeToSeconds(entryStartTime);
    expect(entryTimestampBefore).toBe((currentTimeMs - timeSincePageloadMs + entryStartTime) / 1000);

    // The device sleeps, we detect the drift, and correct the time origin.
    vi.setSystemTime(new Date(currentTimeMs + sleepDurationMs));
    monotonicNowMs += 10;
    timestampInSeconds();

    // Converting the same entry now must not shift it by the drift.
    expect(performanceTimeToSeconds(entryStartTime)).toBe(entryTimestampBefore);
  });

  it('converts times before and after a correction with their own time origin', async () => {
    let monotonicNowMs = timeSincePageloadMs;

    vi.useFakeTimers();
    vi.setSystemTime(new Date(currentTimeMs));
    vi.stubGlobal('performance', {
      timeOrigin: currentTimeMs - timeSincePageloadMs,
      now: () => monotonicNowMs,
    });

    const { performanceTimeToSeconds, timestampInSeconds } = await getFreshTimeModule();

    // The new time origin applies from the last check where both clocks still matched.
    const lastAgreedCheckMs = monotonicNowMs;
    timestampInSeconds();

    const monotonicAdvanceMs = 10;
    vi.setSystemTime(new Date(currentTimeMs + sleepDurationMs));
    monotonicNowMs += monotonicAdvanceMs;
    timestampInSeconds();

    const beforeCorrection = performanceTimeToSeconds(lastAgreedCheckMs - 1) as number;
    const afterCorrection = performanceTimeToSeconds(lastAgreedCheckMs + 1) as number;

    // The two times are 2ms apart in `performance.now()`, but their time origins are a whole sleep apart.
    const driftMs = sleepDurationMs - monotonicAdvanceMs;
    expect(afterCorrection - beforeCorrection).toBeCloseTo((driftMs + 2) / 1000, 6);
  });

  it('converts the first interaction after a sleep with the new time origin', async () => {
    let monotonicNowMs = timeSincePageloadMs;

    vi.useFakeTimers();
    vi.setSystemTime(new Date(currentTimeMs));
    vi.stubGlobal('performance', {
      timeOrigin: currentTimeMs - timeSincePageloadMs,
      now: () => monotonicNowMs,
    });

    const { performanceTimeToSeconds, timestampInSeconds } = await getFreshTimeModule();

    timestampInSeconds();

    // After waking up, the user clicks. The click's entry starts a few ms before we notice the drift.
    vi.setSystemTime(new Date(currentTimeMs + sleepDurationMs));
    const clickStartTime = (monotonicNowMs += 10);
    monotonicNowMs += 5;
    vi.setSystemTime(new Date(currentTimeMs + sleepDurationMs + 5));
    const detectedAt = timestampInSeconds();

    expect(performanceTimeToSeconds(clickStartTime)).toBeCloseTo(detectedAt - 0.005, 6);
  });

  it('keeps the page load origin when the max number of time origins is reached', async () => {
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

  it('converts times before the oldest time origin with that origin', async () => {
    const timeOrigin = currentTimeMs - timeSincePageloadMs;

    vi.useFakeTimers();
    vi.setSystemTime(new Date(currentTimeMs));
    vi.stubGlobal('performance', { timeOrigin, now: () => timeSincePageloadMs });

    const { performanceTimeToSeconds } = await getFreshTimeModule();

    expect(performanceTimeToSeconds(0)).toBe(timeOrigin / 1000);
  });

  it('never uses a `performance.timeOrigin` that was already wrong at startup', async () => {
    // Some browsers report a wrong `performance.timeOrigin`. We should never use it, not even for times from before
    // our first check.
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

  it('keeps the corrected startup origin when the max number of time origins is reached', async () => {
    let monotonicNowMs = timeSincePageloadMs;
    let wallNowMs = currentTimeMs;
    const correctedStartupOrigin = currentTimeMs - timeSincePageloadMs;

    vi.useFakeTimers();
    vi.setSystemTime(new Date(wallNowMs));
    vi.stubGlobal('performance', {
      timeOrigin: correctedStartupOrigin + RELIABLE_THRESHOLD_MS + 60_000,
      now: () => monotonicNowMs,
    });

    const { performanceTimeToSeconds, timestampInSeconds } = await getFreshTimeModule();

    timestampInSeconds();
    for (let i = 0; i < 40; i++) {
      monotonicNowMs += 1_000;
      wallNowMs += 1_000 + sleepDurationMs;
      vi.setSystemTime(new Date(wallNowMs));
      timestampInSeconds();
    }

    expect(performanceTimeToSeconds(0)).toBe(correctedStartupOrigin / 1000);
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
