import { afterEach, describe, expect, it, vi } from 'vitest';

let freshImportId = 0;

async function getFreshTimeModule() {
  return import(`../../../src/utils/time?update=${freshImportId++}`);
}

async function getFreshPerformanceTimeOrigin() {
  // Adding a query param forces a fresh import each time this is called
  // otherwise, the dynamic import would be cached and thus fall back to the cached value.
  const timeModule = await getFreshTimeModule();
  return timeModule.browserPerformanceTimeOrigin();
}

const RELIABLE_THRESHOLD_MS = 300_000;
const DAY_MS = 24 * 60 * 60 * 1_000;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('timestampInSeconds', () => {
  it('uses the Date API when the performance timestamp is inaccurate on initialization', async () => {
    const currentTimeMs = 1_800_000_000_000;

    vi.useFakeTimers();
    vi.setSystemTime(currentTimeMs);
    vi.stubGlobal('performance', {
      timeOrigin: currentTimeMs - 10 * DAY_MS,
      now: () => 3 * DAY_MS,
    });
    const timeModule = await getFreshTimeModule();

    expect(timeModule.timestampInSeconds()).toBe(currentTimeMs / 1_000);
  });

  it.fails('uses the Date API when the performance clock drifts after initialization', async () => {
    const initialTimeMs = 1_800_000_000_000;
    let performanceNow = 0;

    vi.useFakeTimers();
    vi.setSystemTime(initialTimeMs);
    vi.stubGlobal('performance', {
      timeOrigin: initialTimeMs,
      now: () => performanceNow,
    });
    const timeModule = await getFreshTimeModule();
    timeModule.timestampInSeconds();

    vi.setSystemTime(initialTimeMs + 10 * DAY_MS);
    performanceNow += 3 * DAY_MS;

    expect(timeModule.timestampInSeconds()).toBe((initialTimeMs + 10 * DAY_MS) / 1_000);
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
      timing: {
        navigationStart: unreliableTime,
      },
      now: () => timeSincePageloadMs,
    });

    const timeOrigin = await getFreshPerformanceTimeOrigin();
    expect(timeOrigin).toBe(currentTimeMs - timeSincePageloadMs);

    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('returns `Date.now() - performance.now()` if neither `performance.timeOrigin` nor `performance.timing.navigationStart` are available', async () => {
    const currentTimeMs = 1767778040866;

    const timeSincePageloadMs = 1_234.56789;

    vi.useFakeTimers();
    vi.setSystemTime(new Date(currentTimeMs));
    vi.stubGlobal('performance', {
      timeOrigin: undefined,
      timing: {
        navigationStart: undefined,
      },
      now: () => timeSincePageloadMs,
    });

    const timeOrigin = await getFreshPerformanceTimeOrigin();
    expect(timeOrigin).toBe(currentTimeMs - timeSincePageloadMs);

    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('returns `performance.timing.navigationStart` if `performance.timeOrigin` is not available', async () => {
    const currentTimeMs = 1767778040870;

    const navigationStartMs = currentTimeMs - 2_000;

    const timeSincePageloadMs = 1_234.789;

    vi.useFakeTimers();
    vi.setSystemTime(new Date(currentTimeMs));

    vi.stubGlobal('performance', {
      timeOrigin: undefined,
      timing: {
        navigationStart: navigationStartMs,
      },
      now: () => timeSincePageloadMs,
    });

    const timeOrigin = await getFreshPerformanceTimeOrigin();
    expect(timeOrigin).toBe(navigationStartMs);

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
