import { afterEach, describe, expect, it, vi } from 'vitest';

async function getFreshPerformanceTimeOrigin() {
  // Adding the query param with the date, forces a fresh import each time this is called
  // otherwise, the dynamic import would be cached and thus fall back to the cached value.
  const timeModule = await import(`../../../src/utils/time?update=${Date.now()}`);
  return timeModule.browserPerformanceTimeOrigin();
}

let freshImportCounter = 0;

async function getFreshTimestampInSeconds(): Promise<() => number> {
  // A counter rather than `Date.now()`: these tests run under fake timers, which freeze the wall clock and would
  // otherwise hand out a cached module.
  const timeModule = await import(`../../../src/utils/time?update=${freshImportCounter++}`);
  return timeModule.timestampInSeconds;
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

  it('produces monotonically increasing timestamps when the wall clock steps backwards', async () => {
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
