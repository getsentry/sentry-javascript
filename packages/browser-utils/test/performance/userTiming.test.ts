import type { Span } from '@sentry/core';
import { getMainCarrier, SentrySpan, setCurrentClient, spanToJSON } from '@sentry/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { _addUserTimingSpan, userTimingIntegration } from '../../src/performance/userTiming';
import * as utils from '../../src/performance/utils';
import { getDefaultClientOptions, TestClient } from '../utils/TestClient';

describe('userTimingIntegration', () => {
  let client: TestClient;
  let performanceEntries: PerformanceEntry[];
  let spans: Span[];

  beforeEach(() => {
    vi.restoreAllMocks();
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

    _addUserTimingSpan(parentSpan, entry, 0.012, 0.01, 100, 0, []);

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

    _addUserTimingSpan(parentSpan, entry, 0.012, 0.01, 100, 0, []);

    expect(spans).toHaveLength(0);
  });

  it('drops entries whose adjusted start is after their end', () => {
    _addUserTimingSpan(
      parentSpan,
      createPerformanceEntry('measure', 'before-request', 10, 10),
      0.01,
      0.01,
      100,
      0.05,
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
