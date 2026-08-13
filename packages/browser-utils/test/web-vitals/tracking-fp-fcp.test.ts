import { getClient, getMainCarrier, SentrySpan, setCurrentClient, spanToJSON } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addWebVitalsToSpan, startTrackingWebVitals } from '../../src/web-vitals/tracking';
import { getDefaultClientOptions, TestClient } from '../utils/TestClient';

// FCP comes from web-vitals' `onFCP` and FP from our own paint observer, so both register their own
// `PerformanceObserver`. Every constructed observer is collected here and paint entries are handed
// to all of them, the way the browser would.
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

  // Both observers hand off to their handlers in a microtask, so let the queue drain.
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

  it('records fp and fcp on a regular (non-prerendered) page load', async () => {
    vi.stubGlobal('PerformanceObserver', MockPerformanceObserver);
    vi.stubGlobal('addEventListener', vi.fn());
    vi.stubGlobal('removeEventListener', vi.fn());
    vi.stubGlobal('document', {
      prerendering: false,
      readyState: 'complete',
      visibilityState: 'visible',
    });
    vi.stubGlobal('performance', {
      timeOrigin: realPerformance.timeOrigin,
      now: () => realPerformance.now(),
      getEntries: () => [],
      getEntriesByType: (type: string) =>
        type === 'navigation'
          ? [{ type: 'navigate', responseStart: 1, activationStart: 0 } as PerformanceNavigationTiming]
          : [],
    });

    const cleanupWebVitals = startTrackingWebVitals({ trackCls: false, trackLcp: false, client: getClient()! });

    await emitPaintEntries([
      { entryType: 'paint', name: 'first-paint', duration: 0, startTime: 12, toJSON: () => ({}) },
      { entryType: 'paint', name: 'first-contentful-paint', duration: 0, startTime: 18, toJSON: () => ({}) },
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
