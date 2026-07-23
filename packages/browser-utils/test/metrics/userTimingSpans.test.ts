import type { Span } from '@sentry/core';
import {
  getCurrentScope,
  getIsolationScope,
  SentrySpan,
  setCurrentClient,
  spanToJSON,
  startInactiveSpan,
  withActiveSpan,
} from '@sentry/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as instrument from '../../src/metrics/instrument';
import { _addUserTimingSpan, userTimingSpansIntegration } from '../../src/metrics/userTimingSpans';
import { getDefaultClientOptions, TestClient } from '../utils/TestClient';

type PerformanceEntryHandler = (data: { entries: PerformanceEntry[] }) => void;

describe('userTimingSpansIntegration', () => {
  let handlers: Map<string, PerformanceEntryHandler>;
  let spans: Span[];

  beforeEach(() => {
    vi.restoreAllMocks();
    getCurrentScope().clear();
    getIsolationScope().clear();

    const client = new TestClient(getDefaultClientOptions({ tracesSampleRate: 1 }));
    setCurrentClient(client);
    client.init();

    spans = [];
    client.on('spanEnd', span => {
      spans.push(span);
    });

    handlers = new Map();
    vi.spyOn(instrument, 'addPerformanceInstrumentationHandler').mockImplementation((type, handler) => {
      handlers.set(type, handler);
      return () => undefined;
    });
  });

  it('captures mark and measure entries as child spans', () => {
    userTimingSpansIntegration().setup?.({} as never);
    const parentSpan = new SentrySpan({ op: 'pageload', name: '/', sampled: true });

    withActiveSpan(parentSpan, () => {
      handlers.get('mark')!({
        entries: [createPerformanceEntry('mark', 'app-ready', 12, 0)],
      });
      handlers.get('measure')!({
        entries: [createPerformanceEntry('measure', 'hydrate', 14, 25)],
      });
    });

    expect(spans).toHaveLength(2);
    expect(spans.map(span => spanToJSON(span).description)).toEqual(['app-ready', 'hydrate']);
    expect(spans.map(span => spanToJSON(span).op)).toEqual(['mark', 'measure']);
    expect(spanToJSON(spans[0]!).timestamp).toBe(spanToJSON(spans[0]!).start_timestamp);
    expect(spanToJSON(spans[1]!).timestamp! - spanToJSON(spans[1]!).start_timestamp).toBeCloseTo(0.025);
  });

  it('does not capture entries without an active span', () => {
    userTimingSpansIntegration().setup?.({} as never);

    handlers.get('measure')!({
      entries: [createPerformanceEntry('measure', 'background-work', 14, 25)],
    });

    expect(spans).toHaveLength(0);
  });

  it('attaches entries to the root pageload span even when a child span is active', () => {
    userTimingSpansIntegration().setup?.({} as never);
    const rootSpan = new SentrySpan({ op: 'pageload', name: '/', sampled: true });

    withActiveSpan(rootSpan, () => {
      const childSpan = startInactiveSpan({ name: 'child' });
      withActiveSpan(childSpan, () => {
        handlers.get('measure')!({
          entries: [createPerformanceEntry('measure', 'hydrate', 14, 25)],
        });
      });
    });

    const measureSpan = spans.find(span => spanToJSON(span).description === 'hydrate');
    expect(measureSpan).toBeDefined();
    expect(spanToJSON(measureSpan!).parent_span_id).toBe(rootSpan.spanContext().spanId);
  });

  it('does not capture entries when the active span is not a pageload or navigation', () => {
    userTimingSpansIntegration().setup?.({} as never);
    const rootSpan = new SentrySpan({ op: 'ui.action', name: 'click', sampled: true });

    withActiveSpan(rootSpan, () => {
      handlers.get('measure')!({
        entries: [createPerformanceEntry('measure', 'work', 14, 25)],
      });
    });

    expect(spans).toHaveLength(0);
  });

  it('ignores entries matching strings and regular expressions', () => {
    userTimingSpansIntegration({ ignore: ['extension-mark', /^framework-/] }).setup?.({} as never);
    const parentSpan = new SentrySpan({ op: 'pageload', name: '/', sampled: true });

    withActiveSpan(parentSpan, () => {
      handlers.get('mark')!({
        entries: [
          createPerformanceEntry('mark', 'extension-mark', 10, 0),
          createPerformanceEntry('mark', 'application-mark', 11, 0),
        ],
      });
      handlers.get('measure')!({
        entries: [
          createPerformanceEntry('measure', 'framework-render', 12, 10),
          createPerformanceEntry('measure', 'application-render', 13, 10),
        ],
      });
    });

    expect(spans).toHaveLength(2);
    expect(spans.map(span => spanToJSON(span).description)).toEqual(['application-mark', 'application-render']);
  });

  it('does not attach entries preceding a navigation span', () => {
    userTimingSpansIntegration().setup?.({} as never);
    const timeOrigin = performance.timeOrigin / 1000;
    const parentSpan = new SentrySpan({
      op: 'navigation',
      name: '/settings',
      sampled: true,
      startTimestamp: timeOrigin + 0.02,
    });

    withActiveSpan(parentSpan, () => {
      handlers.get('measure')!({
        entries: [
          createPerformanceEntry('measure', 'previous-route', 10, 5),
          createPerformanceEntry('measure', 'current-route', 30, 5),
        ],
      });
    });

    expect(spans).toHaveLength(1);
    expect(spanToJSON(spans[0]!).description).toBe('current-route');
  });
});

describe('_addUserTimingSpan', () => {
  let parentSpan: Span;
  let spans: Span[];

  beforeEach(() => {
    vi.restoreAllMocks();
    getCurrentScope().clear();
    getIsolationScope().clear();

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
    expect(spanToJSON(spans[0]!).data).toEqual({
      'sentry.browser.measure.detail.phase': 'client',
      'sentry.browser.measure.detail.counts': '{"components":4}',
      'sentry.op': 'measure',
      'sentry.origin': 'auto.resource.browser.metrics',
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
