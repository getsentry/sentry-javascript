import type * as SentryCore from '@sentry/core';
import type { Span } from '@sentry/core';
import { getMainCarrier, performanceTimeToSeconds, SentrySpan, setCurrentClient, spanToJSON } from '@sentry/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { _addUserTimingSpan, userTimingIntegration } from '../../src/performance/userTiming';
import * as utils from '../../src/performance/utils';
import * as webVitalsUtils from '../../src/web-vitals/utils';
import { getDefaultClientOptions, TestClient } from '../utils/TestClient';

vi.mock('@sentry/core', async importOriginal => {
  const actual = await importOriginal<typeof SentryCore>();
  return { ...actual, performanceTimeToSeconds: vi.fn(actual.performanceTimeToSeconds) };
});

describe('userTimingIntegration', () => {
  let client: TestClient;
  let performanceEntries: PerformanceEntry[];
  let spans: Span[];

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(performanceTimeToSeconds).mockReset();
    getMainCarrier().__SENTRY__ = undefined;

    client = new TestClient(getDefaultClientOptions({ tracesSampleRate: 1 }));
    setCurrentClient(client);
    client.init();

    performanceEntries = [];
    vi.spyOn(utils, 'getBrowserPerformanceAPI').mockReturnValue({
      getEntries: () => performanceEntries,
    } as Performance);

    spans = [];
    client.on('spanEnd', span => {
      spans.push(span);
    });
  });

  it('captures mark and measure entries created before setup', () => {
    performanceEntries.push(
      createPerformanceEntry('mark', 'app-ready', 12, 0),
      createPerformanceEntry('measure', 'hydrate', 14, 25),
    );

    userTimingIntegration().setup?.(client);
    const parentSpan = new SentrySpan({ op: 'pageload', name: '/', sampled: true });

    client.emit('beforeIdleSpanEnd', parentSpan);

    expect(spans).toHaveLength(2);
    expect(spans.map(span => spanToJSON(span).name)).toEqual(['app-ready', 'hydrate']);
    expect(spans.map(span => spanToJSON(span).attributes['sentry.op'])).toEqual(['mark', 'measure']);
    expect(spanToJSON(spans[0]!).end_timestamp).toBe(spanToJSON(spans[0]!).start_timestamp);
    expect(spanToJSON(spans[1]!).end_timestamp - spanToJSON(spans[1]!).start_timestamp).toBeCloseTo(0.025);
    expect(spanToJSON(spans[1]!).parent_span_id).toBe(parentSpan.spanContext().spanId);
  });

  it('captures only entries added since the previous idle span ended', () => {
    userTimingIntegration().setup?.(client);
    performanceEntries.push(createPerformanceEntry('mark', 'initial-render', 12, 0));

    client.emit('beforeIdleSpanEnd', new SentrySpan({ op: 'pageload', name: '/', sampled: true }));
    performanceEntries.push(createPerformanceEntry('measure', 'route-render', 30, 10));
    client.emit(
      'beforeIdleSpanEnd',
      new SentrySpan({
        op: 'navigation',
        name: '/settings',
        sampled: true,
        startTimestamp: performance.timeOrigin / 1000 + 0.02,
      }),
    );

    expect(spans).toHaveLength(2);
    expect(spans.map(span => spanToJSON(span).name)).toEqual(['initial-render', 'route-render']);
  });

  it('reads the latest entries immediately before the segment ends', () => {
    userTimingIntegration().setup?.(client);
    const parentSpan = new SentrySpan({ op: 'pageload', name: '/', sampled: true });

    performanceEntries.push(createPerformanceEntry('measure', 'last-moment-work', 14, 25));
    client.emit('beforeIdleSpanEnd', parentSpan);

    expect(spans).toHaveLength(1);
    expect(spanToJSON(spans[0]!).name).toBe('last-moment-work');
  });

  it('does not capture entries for unrelated idle spans', () => {
    userTimingIntegration().setup?.(client);
    const idleSpan = new SentrySpan({ op: 'ui.action', name: 'click', sampled: true });
    performanceEntries.push(createPerformanceEntry('measure', 'work', 14, 25));

    client.emit('beforeIdleSpanEnd', idleSpan);

    expect(spans).toHaveLength(0);
  });

  it('ignores entries matching strings and regular expressions', () => {
    userTimingIntegration({ ignore: ['extension-mark', /^framework-/] }).setup?.(client);
    const parentSpan = new SentrySpan({ op: 'pageload', name: '/', sampled: true });

    performanceEntries.push(
      createPerformanceEntry('mark', 'extension-mark', 10, 0),
      createPerformanceEntry('mark', 'application-mark', 11, 0),
      createPerformanceEntry('measure', 'framework-render', 12, 10),
      createPerformanceEntry('measure', 'application-render', 13, 10),
    );
    client.emit('beforeIdleSpanEnd', parentSpan);

    expect(spans).toHaveLength(2);
    expect(spans.map(span => spanToJSON(span).name)).toEqual(['application-mark', 'application-render']);
  });

  it('does not attach entries preceding a navigation span', () => {
    userTimingIntegration().setup?.(client);
    const timeOrigin = performance.timeOrigin / 1000;
    const parentSpan = new SentrySpan({
      op: 'navigation',
      name: '/settings',
      sampled: true,
      startTimestamp: timeOrigin + 0.02,
    });

    performanceEntries.push(
      createPerformanceEntry('measure', 'previous-route', 10, 5),
      createPerformanceEntry('measure', 'current-route', 30, 5),
    );
    client.emit('beforeIdleSpanEnd', parentSpan);

    expect(spans).toHaveLength(1);
    expect(spanToJSON(spans[0]!).name).toBe('current-route');
  });

  it('gives measures starting before the request the exact request span start timestamp', () => {
    userTimingIntegration().setup?.(client);

    // Many values, because only some of them round differently with the old conversion.
    for (let i = 0; i < 50; i++) {
      const requestStart = 10.1 + i * 0.37;
      vi.spyOn(webVitalsUtils, 'getNavigationEntry').mockReturnValue({
        startTime: 0,
        requestStart,
      } as PerformanceNavigationTiming);
      performanceEntries.push(createPerformanceEntry('measure', `before-request-${i}`, 0, 1000));

      client.emit('beforeIdleSpanEnd', new SentrySpan({ op: 'pageload', name: '/', sampled: true }));

      expect(spanToJSON(spans[i]!).start_timestamp).toBe(performanceTimeToSeconds(requestStart, 0));
    }
  });

  it('keeps measures recorded after the wall clock was corrected backwards', () => {
    const timeOrigin = performance.timeOrigin;
    // The time origin was corrected 60s backwards at 1000ms, e.g. by NTP.
    vi.mocked(performanceTimeToSeconds).mockImplementation(
      (monotonicTimeInMs, entryStartTimeInMs = monotonicTimeInMs) =>
        ((entryStartTimeInMs < 1000 ? timeOrigin : timeOrigin - 60_000) + monotonicTimeInMs) / 1000,
    );
    vi.spyOn(webVitalsUtils, 'getNavigationEntry').mockReturnValue({
      startTime: 0,
      requestStart: 10,
    } as PerformanceNavigationTiming);

    userTimingIntegration().setup?.(client);
    performanceEntries.push(createPerformanceEntry('measure', 'after-correction', 2000, 10));
    client.emit('beforeIdleSpanEnd', new SentrySpan({ op: 'pageload', name: '/', sampled: true }));

    expect(spans).toHaveLength(1);
    expect(spanToJSON(spans[0]!).start_timestamp).toBe((timeOrigin - 60_000 + 2000) / 1000);
    expect(spanToJSON(spans[0]!).attributes['sentry.browser.measure_happened_before_request']).toBeUndefined();
  });
});

describe('_addUserTimingSpan', () => {
  let parentSpan: Span;
  let spans: Span[];

  beforeEach(() => {
    vi.restoreAllMocks();
    getMainCarrier().__SENTRY__ = undefined;

    const client = new TestClient(getDefaultClientOptions({ tracesSampleRate: 1 }));
    setCurrentClient(client);
    client.init();

    parentSpan = new SentrySpan({ op: 'pageload', name: '/', sampled: true });
    spans = [];
    client.on('spanEnd', span => {
      spans.push(span);
    });
  });

  it('adds measure detail as span attributes', () => {
    const entry = {
      ...createPerformanceEntry('measure', 'hydrate', 12, 10),
      detail: {
        phase: 'client',
        counts: { components: 4 },
      },
    } as PerformanceMeasure;

    _addUserTimingSpan(parentSpan, entry, 100.012, 100.022, 0, []);

    expect(spans).toHaveLength(1);
    expect(spanToJSON(spans[0]!).attributes).toEqual({
      'sentry.browser.measure.detail.phase': 'client',
      'sentry.browser.measure.detail.counts': '{"components":4}',
      'sentry.op': 'measure',
      'sentry.origin': 'auto.browser.user_timing.measure',
    });
  });

  it('ignores React component performance measures', () => {
    const entry = {
      ...createPerformanceEntry('measure', '​SettingsPanel', 12, 10),
      detail: {
        devtools: {
          track: 'Components ⚛',
        },
      },
    } as PerformanceMeasure;

    _addUserTimingSpan(parentSpan, entry, 100.012, 100.022, 0, []);

    expect(spans).toHaveLength(0);
  });

  it('drops entries whose adjusted start is after their end', () => {
    _addUserTimingSpan(
      parentSpan,
      createPerformanceEntry('measure', 'before-request', 10, 10),
      100.01,
      100.02,
      100.05,
      [],
    );

    expect(spans).toHaveLength(0);
  });
});

function createPerformanceEntry(
  entryType: 'mark' | 'measure',
  name: string,
  startTime: number,
  duration: number,
): PerformanceEntry {
  return {
    entryType,
    name,
    startTime,
    duration,
    toJSON: () => ({}),
  };
}
