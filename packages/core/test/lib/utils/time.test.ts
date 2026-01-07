import { describe, expect, it, vi } from 'vitest';

async function getFreshPerformanceTimeOrigin() {
  // Adding the query param with the date, forces a fresh import each time this is called
  // otherwise, the dynamic import would be cached and thus fall back to the cached value.
  const timeModule = await import(`../../../src/utils/time?update=${Date.now()}`);
  return timeModule.browserPerformanceTimeOrigin();
}

const RELIABLE_THRESHOLD_MS = 3_600_000;

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

  it('returns `Date.now()` if `performance.timeOrigin` is not reliable', async () => {
    const currentTimeMs = 1767778040866;

    const unreliableTime = currentTimeMs - RELIABLE_THRESHOLD_MS - 2_000;

    const timeSincePageloadMs = 1_234.789;

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
    expect(timeOrigin).toBe(1767778040866);

    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('returns `performance.timing.navigationStart` if `performance.timeOrigin` is not available', async () => {
    const currentTimeMs = 1767778040870;

    const navigationStartMs = currentTimeMs - 2_000;
    // const unreliableTime = currentTimeMs - RELIABLE_THRESHOLD_MS - 2_000;

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

  it('returns `performance.timing.navigationStart` if `performance.timeOrigin` is less reliable', async () => {
    const currentTimeMs = 1767778040874;

    const navigationStartMs = currentTimeMs - 2_000;

    const timeSincePageloadMs = 1_234.789;

    vi.useFakeTimers();
    vi.setSystemTime(new Date(currentTimeMs));

    vi.stubGlobal('performance', {
      timeOrigin: navigationStartMs - 1,
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
