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
  };
});

vi.mock('../../src/metrics/web-vitals/lib/observe', () => ({
  observe: vi.fn(),
}));

vi.mock('../../src/metrics/web-vitals/lib/softNavs', () => ({
  softNavs: vi.fn(() => true),
  getSoftNavigationEntry: vi.fn(),
}));

type EventObserverCallback = (entries: Array<{ interactionId?: number }>) => void;
type SoftNavObserverCallback = (entries: Array<{ interactionId?: number; navigationId?: string }>) => void;

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

/** Grab the callback the module registered with `observe(<type>, ...)`. */
function getObserverCallback(type: string): (entries: unknown[]) => void {
  const observeMock = vi.mocked(observeModule.observe);
  const call = observeMock.mock.calls.find(c => c[0] === type);
  if (!call) {
    throw new Error(`${type} observer was not registered`);
  }
  return call[1] as unknown as (entries: unknown[]) => void;
}

describe('softNavCorrelation', () => {
  beforeEach(() => {
    _resetSoftNavCorrelation();
    vi.mocked(observeModule.observe).mockReset();
    vi.mocked(softNavsModule.softNavs).mockReturnValue(true as unknown as boolean);
    vi.mocked(softNavsModule.getSoftNavigationEntry).mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('correlates a soft-nav entry to the navigation span sharing its interactionId', () => {
    const span = createMockSpan('nav-1');
    registerNavigationSpan(span, true);

    // The triggering interaction's event entry lands and attaches its interactionId to the span.
    (getObserverCallback('event') as unknown as EventObserverCallback)([{ interactionId: 42 }]);

    // The soft-nav entry arrives carrying the same interactionId.
    (getObserverCallback('soft-navigation') as unknown as SoftNavObserverCallback)([
      { interactionId: 42, navigationId: 'nav-id-1' },
    ]);

    expect(span.setAttribute).toHaveBeenCalledWith('sentry.navigation_id', 'nav-id-1');
    expect(getNavigationSpanForNavigationId('nav-id-1')).toBe(span);
  });

  it('joins each navigation to its own span by interactionId', () => {
    const spanA = createMockSpan('nav-a');
    registerNavigationSpan(spanA, true);
    (getObserverCallback('event') as unknown as EventObserverCallback)([{ interactionId: 10 }]);

    const spanB = createMockSpan('nav-b');
    registerNavigationSpan(spanB, true);
    (getObserverCallback('event') as unknown as EventObserverCallback)([{ interactionId: 20 }]);

    (getObserverCallback('soft-navigation') as unknown as SoftNavObserverCallback)([
      { interactionId: 20, navigationId: 'id-b' },
    ]);

    expect(spanB.setAttribute).toHaveBeenCalledWith('sentry.navigation_id', 'id-b');
    expect(spanA.setAttribute).not.toHaveBeenCalled();
    expect(getNavigationSpanForNavigationId('id-b')).toBe(spanB);
  });

  it('does not correlate when no span shares the entry interactionId', () => {
    const span = createMockSpan('nav-1');
    registerNavigationSpan(span, true);
    (getObserverCallback('event') as unknown as EventObserverCallback)([{ interactionId: 1 }]);

    (getObserverCallback('soft-navigation') as unknown as SoftNavObserverCallback)([
      { interactionId: 999, navigationId: 'id-unmatched' },
    ]);

    expect(span.setAttribute).not.toHaveBeenCalled();
    expect(getNavigationSpanForNavigationId('id-unmatched')).toBeUndefined();
  });

  it('returns undefined for an unknown navigationId with no buffered entry', () => {
    vi.mocked(softNavsModule.getSoftNavigationEntry).mockReturnValue(undefined);
    expect(getNavigationSpanForNavigationId('never-seen')).toBeUndefined();
    expect(getNavigationSpanForNavigationId(undefined)).toBeUndefined();
  });

  it('joins via the buffered soft-navigation entry when the observer has not fired yet', () => {
    const span = createMockSpan('nav-1');
    registerNavigationSpan(span, true);
    (getObserverCallback('event') as unknown as EventObserverCallback)([{ interactionId: 7 }]);

    // The soft-nav observer never fires; the entry is available synchronously in the buffer with
    // the same interactionId the span was registered against.
    vi.mocked(softNavsModule.getSoftNavigationEntry).mockReturnValue({
      interactionId: 7,
      navigationId: 'id-buffered',
    } as unknown as ReturnType<typeof softNavsModule.getSoftNavigationEntry>);

    expect(getNavigationSpanForNavigationId('id-buffered')).toBe(span);
    expect(span.setAttribute).toHaveBeenCalledWith('sentry.navigation_id', 'id-buffered');
  });

  it('is a no-op when soft navs are not enabled', () => {
    vi.mocked(softNavsModule.softNavs).mockReturnValue(false as unknown as boolean);
    const span = createMockSpan('nav-1');

    registerNavigationSpan(span, false);

    expect(observeModule.observe).not.toHaveBeenCalled();
  });
});
