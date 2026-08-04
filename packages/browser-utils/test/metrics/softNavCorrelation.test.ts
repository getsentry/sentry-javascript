import type * as SentryCore from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  _resetSoftNavCorrelation,
  getNavigationSpanForNavigationId,
  registerNavigationSpan,
} from '../../src/metrics/softNavCorrelation';

type ObserverEntries = Array<{ interactionId?: number; navigationId?: number }>;

// Registry of PerformanceObserver callbacks by observed entry type, so tests can drive them.
const observers = new Map<string, (entries: ObserverEntries) => void>();
let softNavEntries: ObserverEntries = [];

// Minimal PerformanceObserver mock that records the callback per observed `type`.
class MockPerformanceObserver {
  public constructor(private _cb: (list: { getEntries: () => ObserverEntries }) => void) {}
  public static supportedEntryTypes = ['event', 'first-input', 'soft-navigation'];
  public observe(opts: { type: string }): void {
    observers.set(opts.type, entries => this._cb({ getEntries: () => entries }));
  }
  public disconnect(): void {
    /* no-op */
  }
}

function fireObserver(type: string, entries: ObserverEntries): void {
  const cb = observers.get(type);
  if (!cb) {
    throw new Error(`${type} observer was not registered`);
  }
  cb(entries);
}

function createMockSpan(spanId: string): SentryCore.Span {
  const attributes: Record<string, unknown> = {};
  return {
    spanContext: () => ({ spanId, traceId: 'trace-1', traceFlags: 1 }),
    setAttribute: vi.fn((key: string, value: unknown) => {
      attributes[key] = value;
    }),
    _attributes: attributes,
  } as unknown as SentryCore.Span;
}

describe('softNavCorrelation', () => {
  beforeEach(() => {
    observers.clear();
    softNavEntries = [];
    _resetSoftNavCorrelation();
    vi.stubGlobal('PerformanceObserver', MockPerformanceObserver);
    // Buffered soft-navigation entries, read by getNavigationSpanForNavigationId's fallback.
    vi.stubGlobal('performance', {
      getEntriesByType: (type: string) => (type === 'soft-navigation' ? softNavEntries : []),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('correlates a soft-nav entry to the navigation span sharing its interactionId', () => {
    const span = createMockSpan('nav-1');
    registerNavigationSpan(span, true);

    // The triggering interaction's event entry lands and attaches its interactionId to the span.
    fireObserver('event', [{ interactionId: 42 }]);
    // The soft-nav entry arrives carrying the same interactionId.
    fireObserver('soft-navigation', [{ interactionId: 42, navigationId: 5001 }]);

    expect(span.setAttribute).toHaveBeenCalledWith('sentry.navigation_id', 5001);
    expect(getNavigationSpanForNavigationId(5001)).toBe(span);
  });

  it('joins each navigation to its own span by interactionId', () => {
    const spanA = createMockSpan('nav-a');
    registerNavigationSpan(spanA, true);
    fireObserver('event', [{ interactionId: 10 }]);

    const spanB = createMockSpan('nav-b');
    registerNavigationSpan(spanB, true);
    fireObserver('event', [{ interactionId: 20 }]);

    fireObserver('soft-navigation', [{ interactionId: 20, navigationId: 5002 }]);

    expect(spanB.setAttribute).toHaveBeenCalledWith('sentry.navigation_id', 5002);
    expect(spanA.setAttribute).not.toHaveBeenCalled();
    expect(getNavigationSpanForNavigationId(5002)).toBe(spanB);
  });

  it('does not correlate when no span shares the entry interactionId', () => {
    const span = createMockSpan('nav-1');
    registerNavigationSpan(span, true);
    fireObserver('event', [{ interactionId: 1 }]);

    fireObserver('soft-navigation', [{ interactionId: 999, navigationId: 5003 }]);

    expect(span.setAttribute).not.toHaveBeenCalled();
    expect(getNavigationSpanForNavigationId(5003)).toBeUndefined();
  });

  it('returns undefined for an unknown navigationId with no buffered entry', () => {
    expect(getNavigationSpanForNavigationId(404)).toBeUndefined();
    expect(getNavigationSpanForNavigationId(undefined)).toBeUndefined();
  });

  it('joins via the buffered soft-navigation entry when the observer has not fired yet', () => {
    const span = createMockSpan('nav-1');
    registerNavigationSpan(span, true);
    fireObserver('event', [{ interactionId: 7 }]);

    // The soft-nav observer never fires; the entry is available synchronously in the buffer with
    // the same interactionId the span was registered against.
    softNavEntries = [{ interactionId: 7, navigationId: 5004 }];

    expect(getNavigationSpanForNavigationId(5004)).toBe(span);
    expect(span.setAttribute).toHaveBeenCalledWith('sentry.navigation_id', 5004);
  });

  it('is a no-op when soft navs are not enabled', () => {
    const span = createMockSpan('nav-1');
    registerNavigationSpan(span, false);

    expect(observers.size).toBe(0);
  });
});
