import { getClient, getMainCarrier, SentrySpan, setCurrentClient, spanToJSON } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addWebVitalsToSpan, startTrackingWebVitals } from '../../src/web-vitals/tracking';
import { getDefaultClientOptions, TestClient } from '../utils/TestClient';

// Lives in its own file rather than alongside the regular-page-load case: the paint observers, the
// `instrumented` registry and the visibility watcher are all module-level singletons that can only
// be armed once, so a second scenario in the same file would reuse the first one's state.

interface ObserverRegistration {
  callback: (list: PerformanceObserverEntryList) => void;
  buffered: boolean;
}

const observers: ObserverRegistration[] = [];
const emittedEntries: PerformanceEntry[] = [];

function deliver(callback: (list: PerformanceObserverEntryList) => void, entries: PerformanceEntry[]): void {
  callback({ getEntries: () => entries } as PerformanceObserverEntryList);
}

/**
 * Models the two things the real `PerformanceObserver` does that matter here: entries go to every
 * observer already listening, and an observer that registers later with `buffered: true` is replayed
 * the ones it missed. That difference is the point of this test: our paint observer is listening
 * during the prerender, web-vitals' only registers after activation.
 */
class MockPerformanceObserver {
  public static supportedEntryTypes = ['paint'];

  private _registration: ObserverRegistration;

  public constructor(callback: (list: PerformanceObserverEntryList) => void) {
    this._registration = { callback, buffered: false };
    observers.push(this._registration);
  }

  public observe(options?: { buffered?: boolean }): void {
    this._registration.buffered = !!options?.buffered;

    if (this._registration.buffered && emittedEntries.length) {
      deliver(this._registration.callback, emittedEntries);
    }
  }

  public disconnect(): void {
    // noop
  }
}

function emitPaintEntries(entries: PerformanceEntry[]): void {
  emittedEntries.push(...entries);

  for (const { callback } of observers) {
    deliver(callback, entries);
  }
}

function flush(): Promise<void> {
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
    // The document is still sitting in the prerender buffer, so `activationStart` reads 0. It only
    // becomes the real activation time once the user navigates to the page.
    const navigationEntry = { type: 'navigate', responseStart: 1, activationStart: 0 } as PerformanceNavigationTiming;
    const documentStub = { prerendering: true, readyState: 'complete', visibilityState: 'visible' };
    const pageListeners: Record<string, Array<() => void>> = {};

    vi.stubGlobal('PerformanceObserver', MockPerformanceObserver);
    vi.stubGlobal('addEventListener', (type: string, listener: () => void) => {
      (pageListeners[type] ??= []).push(listener);
    });
    vi.stubGlobal('removeEventListener', vi.fn());
    vi.stubGlobal('document', documentStub);
    vi.stubGlobal('performance', {
      timeOrigin: realPerformance.timeOrigin,
      now: () => realPerformance.now(),
      getEntries: () => [],
      getEntriesByType: (type: string) => (type === 'navigation' ? [navigationEntry] : []),
    });

    const cleanupWebVitals = startTrackingWebVitals({ trackCls: false, trackLcp: false, client: getClient()! });

    // The page paints while it is still prerendering, 5s into the prerender navigation. Our paint
    // observer sees this right away; web-vitals' `onFCP` is still waiting on `prerenderingchange`.
    emitPaintEntries([
      { entryType: 'paint', name: 'first-paint', duration: 0, startTime: 5012, toJSON: () => ({}) },
      { entryType: 'paint', name: 'first-contentful-paint', duration: 0, startTime: 5018, toJSON: () => ({}) },
    ] as PerformanceEntry[]);
    await flush();

    // The user clicks the link and the page activates 5s into the prerender navigation, so the
    // paints they actually perceived happened 12ms and 18ms after the click.
    documentStub.prerendering = false;
    navigationEntry.activationStart = 5000;
    pageListeners.prerenderingchange?.forEach(listener => listener());
    await flush();

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
