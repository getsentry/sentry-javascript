import { afterEach, describe, expect, it, vi } from 'vitest';
import { onLCP } from '../../../src/metrics/web-vitals/getLCP';
import type { LCPMetric } from '../../../src/metrics/web-vitals/types';

function stubPerformanceObserver(): { emit: (entries: unknown[]) => Promise<void> } {
  let observerCallback: ((list: PerformanceObserverEntryList) => void) | undefined;

  class MockPerformanceObserver {
    public static supportedEntryTypes = ['largest-contentful-paint'];

    public constructor(callback: (list: PerformanceObserverEntryList) => void) {
      observerCallback = callback;
    }

    public observe(): void {
      // noop
    }

    public disconnect(): void {
      // noop
    }

    public takeRecords(): PerformanceEntryList {
      return [];
    }
  }

  vi.stubGlobal('PerformanceObserver', MockPerformanceObserver);
  vi.stubGlobal('addEventListener', vi.fn());
  vi.stubGlobal('removeEventListener', vi.fn());
  vi.stubGlobal('document', {
    prerendering: false,
    readyState: 'complete',
    visibilityState: 'visible',
  });

  return {
    emit: async entries => {
      observerCallback?.({ getEntries: () => entries } as unknown as PerformanceObserverEntryList);
      // `observe` defers the callback by a microtask.
      await Promise.resolve();
    },
  };
}

function lcpEntry(startTime: number): unknown {
  return { entryType: 'largest-contentful-paint', name: '', duration: 0, startTime, toJSON: () => ({}) };
}

describe('onLCP', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('skips nullish entries and still reports the valid ones', async () => {
    const { emit } = stubPerformanceObserver();

    const reported: LCPMetric[] = [];
    onLCP(metric => reported.push(metric), { reportAllChanges: true });

    await emit([undefined, lcpEntry(1234), null]);

    expect(reported).toHaveLength(1);
    expect(reported[0]?.value).toBe(1234);
  });
});
