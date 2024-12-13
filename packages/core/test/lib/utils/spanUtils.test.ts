import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SPAN_STATUS_ERROR,
  SPAN_STATUS_OK,
  SPAN_STATUS_UNSET,
  SentrySpan,
  TRACEPARENT_REGEXP,
  setCurrentClient,
  spanToTraceHeader,
  startInactiveSpan,
  startSpan,
  timestampInSeconds,
} from '../../../src';
import type { Span, SpanAttributes, SpanStatus, SpanTimeInput } from '../../../src/types-hoist';
import type { OpenTelemetrySdkTraceBaseSpan } from '../../../src/utils/spanUtils';
import { spanToTraceContext } from '../../../src/utils/spanUtils';
import { getRootSpan, spanIsSampled, spanTimeInputToSeconds, spanToJSON } from '../../../src/utils/spanUtils';
import { TestClient, getDefaultTestClientOptions } from '../../mocks/client';

function createMockedOtelSpan({
  spanId,
  traceId,
  isRemote,
  attributes = {},
  startTime = Date.now(),
  name = 'test span',
  status = { code: SPAN_STATUS_UNSET },
  endTime = Date.now(),
  parentSpanId,
}: {
  spanId: string;
  traceId: string;
  attributes?: SpanAttributes;
  startTime?: SpanTimeInput;
  isRemote?: boolean;
  name?: string;
  status?: SpanStatus;
  endTime?: SpanTimeInput;
  parentSpanId?: string;
}): Span {
  return {
    spanContext: () => {
      return {
        spanId,
        traceId,
        isRemote,
      };
    },
    attributes,
    startTime,
    name,
    status,
    endTime,
    parentSpanId,
  } as OpenTelemetrySdkTraceBaseSpan;
}

describe('spanToTraceHeader', () => {
  test('simple', () => {
    const span = new SentrySpan();
    expect(spanToTraceHeader(span)).toMatch(TRACEPARENT_REGEXP);
  });
  test('with sample', () => {
    const span = new SentrySpan({ sampled: true });
    expect(spanToTraceHeader(span)).toMatch(TRACEPARENT_REGEXP);
  });
});

describe('spanToTraceContext', () => {
  it('works with a minimal span', () => {
    const span = new SentrySpan({ spanId: '1234', traceId: 'ABCD' });

    expect(spanToTraceContext(span)).toEqual({
      span_id: '1234',
      trace_id: 'ABCD',
    });
  });

  it('works with a span with parentSpanId', () => {
    const span = new SentrySpan({
      spanId: '1234',
      traceId: 'ABCD',
      parentSpanId: '5678',
    });

    expect(spanToTraceContext(span)).toEqual({
      span_id: '1234',
      trace_id: 'ABCD',
      parent_span_id: '5678',
    });
  });

  it('works with a local OTEL span', () => {
    const span = createMockedOtelSpan({
      spanId: '1234',
      traceId: 'ABCD',
      isRemote: false,
    });

    expect(spanToTraceContext(span)).toEqual({
      span_id: '1234',
      trace_id: 'ABCD',
    });
  });

  it('works with a local OTEL span with parentSpanId', () => {
    const span = createMockedOtelSpan({
      spanId: '1234',
      traceId: 'ABCD',
      isRemote: false,
      parentSpanId: 'XYZ',
    });

    expect(spanToTraceContext(span)).toEqual({
      parent_span_id: 'XYZ',
      span_id: '1234',
      trace_id: 'ABCD',
    });
  });

  it('works with a remote OTEL span', () => {
    const span = createMockedOtelSpan({
      spanId: '1234',
      traceId: 'ABCD',
      isRemote: true,
    });

    expect(spanToTraceContext(span)).toEqual({
      parent_span_id: '1234',
      span_id: expect.stringMatching(/^[0-9a-f]{16}$/),
      trace_id: 'ABCD',
    });
  });

  it('works with a remote OTEL span with parentSpanId', () => {
    const span = createMockedOtelSpan({
      spanId: '1234',
      traceId: 'ABCD',
      isRemote: true,
      parentSpanId: 'XYZ',
    });

    expect(spanToTraceContext(span)).toEqual({
      parent_span_id: '1234',
      span_id: expect.stringMatching(/^[0-9a-f]{16}$/),
      trace_id: 'ABCD',
    });
  });
});

describe('spanTimeInputToSeconds', () => {
  it('works with undefined', () => {
    const now = timestampInSeconds();
    expect(spanTimeInputToSeconds(undefined)).toBeGreaterThanOrEqual(now);
  });

  it('works with a timestamp in seconds', () => {
    const timestamp = timestampInSeconds();
    expect(spanTimeInputToSeconds(timestamp)).toEqual(timestamp);
  });

  it('works with a timestamp in milliseconds', () => {
    const timestamp = Date.now();
    expect(spanTimeInputToSeconds(timestamp)).toEqual(timestamp / 1000);
  });

  it('works with a Date object', () => {
    const timestamp = new Date();
    expect(spanTimeInputToSeconds(timestamp)).toEqual(timestamp.getTime() / 1000);
  });

  it('works with a simple array', () => {
    const seconds = Math.floor(timestampInSeconds());
    const timestamp: [number, number] = [seconds, 0];
    expect(spanTimeInputToSeconds(timestamp)).toEqual(seconds);
  });

  it('works with a array with nanoseconds', () => {
    const seconds = Math.floor(timestampInSeconds());
    const timestamp: [number, number] = [seconds, 9000];
    expect(spanTimeInputToSeconds(timestamp)).toEqual(seconds + 0.000009);
  });
});

describe('spanToJSON', () => {
  describe('SentrySpan', () => {
    it('works with a simple span', () => {
      const span = new SentrySpan();
      expect(spanToJSON(span)).toEqual({
        span_id: span.spanContext().spanId,
        trace_id: span.spanContext().traceId,
        origin: 'manual',
        start_timestamp: span['_startTime'],
        data: {
          'sentry.origin': 'manual',
        },
      });
    });

    it('works with a full span', () => {
      const span = new SentrySpan({
        name: 'test name',
        op: 'test op',
        parentSpanId: '1234',
        spanId: '5678',
        traceId: 'abcd',
        startTimestamp: 123,
        endTimestamp: 456,
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto',
        },
      });
      span.setStatus({ code: SPAN_STATUS_OK });

      expect(spanToJSON(span)).toEqual({
        description: 'test name',
        op: 'test op',
        parent_span_id: '1234',
        span_id: '5678',
        status: 'ok',
        trace_id: 'abcd',
        origin: 'auto',
        start_timestamp: 123,
        timestamp: 456,
        data: {
          'sentry.op': 'test op',
          'sentry.origin': 'auto',
        },
      });
    });
  });

  describe('OpenTelemetry Span', () => {
    it('works with a simple span', () => {
      const span = createMockedOtelSpan({
        spanId: 'SPAN-1',
        traceId: 'TRACE-1',
        name: 'test span',
        startTime: 123,
        endTime: [0, 0],
        attributes: {},
        status: { code: SPAN_STATUS_UNSET },
      });

      expect(spanToJSON(span)).toEqual({
        span_id: 'SPAN-1',
        trace_id: 'TRACE-1',
        start_timestamp: 123,
        description: 'test span',
        data: {},
      });
    });

    it('works with a full span', () => {
      const span = createMockedOtelSpan({
        spanId: 'SPAN-1',
        traceId: 'TRACE-1',
        name: 'test span',
        startTime: 123,
        endTime: 456,
        attributes: {
          attr1: 'value1',
          attr2: 2,
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'test op',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto',
        },
        status: { code: SPAN_STATUS_ERROR, message: 'unknown_error' },
      });

      expect(spanToJSON(span)).toEqual({
        span_id: 'SPAN-1',
        trace_id: 'TRACE-1',
        start_timestamp: 123,
        timestamp: 456,
        description: 'test span',
        op: 'test op',
        origin: 'auto',
        data: {
          attr1: 'value1',
          attr2: 2,
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'test op',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto',
        },
        status: 'unknown_error',
      });
    });
  });

  it('returns empty object for unknown span implementation', () => {
    const span = { other: 'other' };

    expect(spanToJSON(span as unknown as Span)).toEqual({});
  });
});

describe('spanIsSampled', () => {
  test('sampled', () => {
    const span = new SentrySpan({ sampled: true });
    expect(spanIsSampled(span)).toBe(true);
  });

  test('not sampled', () => {
    const span = new SentrySpan({ sampled: false });
    expect(spanIsSampled(span)).toBe(false);
  });
});

describe('getRootSpan', () => {
  beforeEach(() => {
    const client = new TestClient(getDefaultTestClientOptions({ tracesSampleRate: 1 }));
    setCurrentClient(client);
  });

  it('returns the root span of a span that is a root span', () => {
    const root = new SentrySpan({ name: 'test' });

    expect(getRootSpan(root)).toBe(root);
  });

  it('returns the root span of a child span', () => {
    startSpan({ name: 'outer' }, root => {
      startSpan({ name: 'inner' }, inner => {
        expect(getRootSpan(inner)).toBe(root);
        startSpan({ name: 'inner2' }, inner2 => {
          expect(getRootSpan(inner2)).toBe(root);

          const inactiveSpan = startInactiveSpan({ name: 'inactive' });
          expect(getRootSpan(inactiveSpan)).toBe(root);
        });
      });
    });
  });
});
