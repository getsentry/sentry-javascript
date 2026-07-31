import * as SentryCore from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  _resetSoftNavCorrelation,
  getNavigationSpanForNavigationId,
  registerNavigationSpan,
} from '../../src/metrics/softNavCorrelation';
import * as observeModule from '../../src/metrics/web-vitals/lib/observe';
import * as softNavsModule from '../../src/metrics/web-vitals/lib/softNavs';

vi.mock('@sentry/core', async () => {
  const actual = await vi.importActual('@sentry/core');
  return {
    ...actual,
    browserPerformanceTimeOrigin: vi.fn(() => 0),
    spanToJSON: vi.fn(),
  };
});

vi.mock('../../src/metrics/web-vitals/lib/observe', () => ({
  observe: vi.fn(),
}));

vi.mock('../../src/metrics/web-vitals/lib/softNavs', () => ({
  softNavs: vi.fn(() => true),
  getSoftNavigationEntry: vi.fn(),
}));

type SoftNavObserverCallback = (entries: Array<{ navigationId?: string; startTime: number }>) => void;

function createMockSpan(spanId: string): SentryCore.Span {
  const attributes: Record<string, unknown> = {};
  return {
    spanContext: () => ({ spanId, traceId: 'trace-1', traceFlags: 1 }),
    setAttribute: vi.fn((key: string, value: unknown) => {
      attributes[key] = value;
    }),
    // expose for assertions
    _attributes: attributes,
  } as unknown as SentryCore.Span;
}

/** Grab the callback the module registered with `observe('soft-navigation', ...)`. */
function getObserverCallback(): SoftNavObserverCallback {
  const observeMock = vi.mocked(observeModule.observe);
  const call = observeMock.mock.calls.find(c => c[0] === 'soft-navigation');
  if (!call) {
    throw new Error('soft-navigation observer was not registered');
  }
  return call[1] as unknown as SoftNavObserverCallback;
}

describe('softNavCorrelation', () => {
  beforeEach(() => {
    _resetSoftNavCorrelation();
    vi.mocked(SentryCore.spanToJSON).mockReset();
    vi.mocked(observeModule.observe).mockReset();
    vi.mocked(softNavsModule.softNavs).mockReturnValue(true as unknown as boolean);
    vi.mocked(softNavsModule.getSoftNavigationEntry).mockReset();
    vi.mocked(SentryCore.browserPerformanceTimeOrigin).mockReturnValue(0);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('correlates a soft-nav entry to the navigation span with the closest start time', () => {
    const span = createMockSpan('nav-1');
    vi.mocked(SentryCore.spanToJSON).mockReturnValue({ start_timestamp: 10 } as ReturnType<
      typeof SentryCore.spanToJSON
    >);

    registerNavigationSpan(span, true);

    // soft-nav entry arrives with startTime (ms) matching the span start (10s -> 10000ms)
    const cb = getObserverCallback();
    cb([{ navigationId: 'nav-id-1', startTime: 10_000 }]);

    expect(span.setAttribute).toHaveBeenCalledWith('sentry.navigation_id', 'nav-id-1');
    expect(getNavigationSpanForNavigationId('nav-id-1')).toBe(span);
  });

  it('picks the closest span when multiple navigations are registered', () => {
    const spanA = createMockSpan('nav-a');
    const spanB = createMockSpan('nav-b');
    vi.mocked(SentryCore.spanToJSON)
      .mockReturnValueOnce({ start_timestamp: 10 } as ReturnType<typeof SentryCore.spanToJSON>)
      .mockReturnValueOnce({ start_timestamp: 20 } as ReturnType<typeof SentryCore.spanToJSON>);

    registerNavigationSpan(spanA, true);
    registerNavigationSpan(spanB, true);

    const cb = getObserverCallback();
    cb([{ navigationId: 'id-b', startTime: 20_000 }]);

    expect(spanB.setAttribute).toHaveBeenCalledWith('sentry.navigation_id', 'id-b');
    expect(spanA.setAttribute).not.toHaveBeenCalled();
    expect(getNavigationSpanForNavigationId('id-b')).toBe(spanB);
  });

  it('does not correlate when no span is within the match tolerance', () => {
    const span = createMockSpan('nav-1');
    vi.mocked(SentryCore.spanToJSON).mockReturnValue({ start_timestamp: 10 } as ReturnType<
      typeof SentryCore.spanToJSON
    >);

    registerNavigationSpan(span, true);

    const cb = getObserverCallback();
    // entry start is 5s away from the only span (well beyond the 0.1s tolerance)
    cb([{ navigationId: 'id-far', startTime: 15_000 }]);

    expect(span.setAttribute).not.toHaveBeenCalled();
    expect(getNavigationSpanForNavigationId('id-far')).toBeUndefined();
  });

  it('returns undefined for an unknown navigationId with no buffered entry', () => {
    vi.mocked(softNavsModule.getSoftNavigationEntry).mockReturnValue(undefined);
    expect(getNavigationSpanForNavigationId('never-seen')).toBeUndefined();
    expect(getNavigationSpanForNavigationId(undefined)).toBeUndefined();
  });

  it('falls back to the buffered soft-navigation entry when the observer has not fired yet', () => {
    const span = createMockSpan('nav-1');
    vi.mocked(SentryCore.spanToJSON).mockReturnValue({ start_timestamp: 30 } as ReturnType<
      typeof SentryCore.spanToJSON
    >);
    registerNavigationSpan(span, true);

    // observer never fires; instead the entry is available synchronously in the buffer
    vi.mocked(softNavsModule.getSoftNavigationEntry).mockReturnValue({
      startTime: 30_000,
      navigationId: 'id-buffered',
    } as unknown as ReturnType<typeof softNavsModule.getSoftNavigationEntry>);

    expect(getNavigationSpanForNavigationId('id-buffered')).toBe(span);
    expect(span.setAttribute).toHaveBeenCalledWith('sentry.navigation_id', 'id-buffered');
  });

  it('is a no-op when soft navs are not enabled', () => {
    vi.mocked(softNavsModule.softNavs).mockReturnValue(false as unknown as boolean);
    const span = createMockSpan('nav-1');
    vi.mocked(SentryCore.spanToJSON).mockReturnValue({ start_timestamp: 10 } as ReturnType<
      typeof SentryCore.spanToJSON
    >);

    registerNavigationSpan(span, false);

    expect(observeModule.observe).not.toHaveBeenCalled();
  });
});
