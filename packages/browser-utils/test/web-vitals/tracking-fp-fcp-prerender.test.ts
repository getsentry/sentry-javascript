import { getClient, getMainCarrier, SentrySpan, setCurrentClient, spanToJSON } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addWebVitalsToSpan, startTrackingWebVitals } from '../../src/web-vitals/tracking';
import { getDefaultClientOptions, TestClient } from '../utils/TestClient';

// Lives in its own file rather than alongside the regular-page-load case: the paint observers, the
// `instrumented` registry and the visibility watcher are all module-level singletons that can only
// be armed once, so a second scenario in the same file would reuse the first one's state.
const paintObserverCallbacks: Array<(list: PerformanceObserverEntryList) => void> = [];

class MockPerformanceObserver {
  public static supportedEntryTypes = ['paint'];

  public constructor(callback: (list: PerformanceObserverEntryList) => void) {
    paintObserverCallbacks.push(callback);
  }

  public observe(): void {
    // noop
  }

  public disconnect(): void {
    // noop
  }
}

function emitPaintEntries(entries: PerformanceEntry[]): Promise<void> {
  for (const callback of paintObserverCallbacks) {
    callback({ getEntries: () => entries } as PerformanceObserverEntryList);
  }

  return new Promise(resolve => setTimeout(resolve, 0));
}

describe('startTrackingWebVitals', () => {
  const realPerformance = globalThis.performance;

  beforeEach(() => {
    getMainCarrier().__SENTRY__ = undefined;

    const client = new TestClient(getDefaultClientOptions({ tracesSampleRate: 1 }));
    setCurrentClient(client);
    client.init();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('rebases fp and fcp against activationStart for prerendered pages', async () => {
    vi.stubGlobal('PerformanceObserver', MockPerformanceObserver);
    vi.stubGlobal('addEventListener', vi.fn());
    vi.stubGlobal('removeEventListener', vi.fn());
    vi.stubGlobal('document', {
      prerendering: false,
      readyState: 'complete',
      visibilityState: 'visible',
    });

    // The document sat in the prerender buffer for 5s before the user navigated to it, so paint
    // timestamps are 5s into the prerender navigation while the user only perceived ~12/18ms.
    vi.stubGlobal('performance', {
      timeOrigin: realPerformance.timeOrigin,
      now: () => realPerformance.now(),
      getEntries: () => [],
      getEntriesByType: (type: string) =>
        type === 'navigation'
          ? [{ type: 'navigate', responseStart: 1, activationStart: 5000 } as PerformanceNavigationTiming]
          : [],
    });

    const cleanupWebVitals = startTrackingWebVitals({ trackCls: false, trackLcp: false, client: getClient()! });

    await emitPaintEntries([
      { entryType: 'paint', name: 'first-paint', duration: 0, startTime: 5012, toJSON: () => ({}) },
      { entryType: 'paint', name: 'first-contentful-paint', duration: 0, startTime: 5018, toJSON: () => ({}) },
    ] as PerformanceEntry[]);

    cleanupWebVitals();

    const pageloadSpan = new SentrySpan({ op: 'pageload', name: '/', sampled: true });
    addWebVitalsToSpan(pageloadSpan, {
      recordClsOnPageloadSpan: true,
      recordLcpOnPageloadSpan: true,
      spanStreamingEnabled: true,
    });

    expect(spanToJSON(pageloadSpan).attributes['browser.web_vital.fp.value']).toBe(12);
    expect(spanToJSON(pageloadSpan).attributes['browser.web_vital.fcp.value']).toBe(18);
  });
});
