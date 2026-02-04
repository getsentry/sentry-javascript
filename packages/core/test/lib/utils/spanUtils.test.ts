import { beforeEach, describe, expect, it, test } from 'vitest';
import {
  convertSpanLinksForEnvelope,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  SEMANTIC_LINK_ATTRIBUTE_LINK_TYPE,
  SentrySpan,
  setCurrentClient,
  SPAN_STATUS_ERROR,
  SPAN_STATUS_OK,
  SPAN_STATUS_UNSET,
  spanToTraceHeader,
  startInactiveSpan,
  startSpan,
  timestampInSeconds,
  TRACEPARENT_REGEXP,
} from '../../../src';
import type { SpanLink } from '../../../src/types-hoist/link';
import type { Span, SpanAttributes, SpanTimeInput, StreamedSpanJSON } from '../../../src/types-hoist/span';
import type { SpanStatus } from '../../../src/types-hoist/spanStatus';
import type { OpenTelemetrySdkTraceBaseSpan } from '../../../src/utils/spanUtils';
import {
  getRootSpan,
  spanIsSampled,
  spanTimeInputToSeconds,
  spanToJSON,
  spanToStreamedSpanJSON,
  spanToTraceContext,
  streamedSpanJsonToSerializedSpan,
  TRACE_FLAG_NONE,
  TRACE_FLAG_SAMPLED,
  updateSpanName,
} from '../../../src/utils/spanUtils';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';

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
  links = undefined,
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
  links?: SpanLink[];
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
    links,
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

describe('convertSpanLinksForEnvelope', () => {
  it('returns undefined for undefined input', () => {
    expect(convertSpanLinksForEnvelope(undefined)).toBeUndefined();
  });

  it('returns undefined for empty array input', () => {
    expect(convertSpanLinksForEnvelope([])).toBeUndefined();
  });

  it('converts a single span link to a flattened envelope item', () => {
    const links: SpanLink[] = [
      {
        context: {
          spanId: 'span1',
          traceId: 'trace1',
          traceFlags: TRACE_FLAG_SAMPLED,
        },
        attributes: {
          'sentry.link.type': 'previous_trace',
        },
      },
    ];

    const result = convertSpanLinksForEnvelope(links);

    result?.forEach(item => expect(item).not.toHaveProperty('context'));
    expect(result).toEqual([
      {
        span_id: 'span1',
        trace_id: 'trace1',
        sampled: true,
        attributes: {
          'sentry.link.type': 'previous_trace',
        },
      },
    ]);
  });

  it('converts multiple span links to a flattened envelope item', () => {
    const links: SpanLink[] = [
      {
        context: {
          spanId: 'span1',
          traceId: 'trace1',
          traceFlags: TRACE_FLAG_SAMPLED,
        },
        attributes: {
          'sentry.link.type': 'previous_trace',
        },
      },
      {
        context: {
          spanId: 'span2',
          traceId: 'trace2',
          traceFlags: TRACE_FLAG_NONE,
        },
        attributes: {
          'sentry.link.type': 'another_trace',
        },
      },
    ];

    const result = convertSpanLinksForEnvelope(links);

    result?.forEach(item => expect(item).not.toHaveProperty('context'));
    expect(result).toEqual([
      {
        span_id: 'span1',
        trace_id: 'trace1',
        sampled: true,
        attributes: {
          'sentry.link.type': 'previous_trace',
        },
      },
      {
        span_id: 'span2',
        trace_id: 'trace2',
        sampled: false,
        attributes: {
          'sentry.link.type': 'another_trace',
        },
      },
    ]);
  });

  it('handles span links without attributes', () => {
    const links: SpanLink[] = [
      {
        context: {
          spanId: 'span1',
          traceId: 'trace1',
          traceFlags: TRACE_FLAG_SAMPLED,
        },
      },
    ];

    const result = convertSpanLinksForEnvelope(links);

    result?.forEach(item => expect(item).not.toHaveProperty('context'));
    expect(result).toEqual([
      {
        span_id: 'span1',
        trace_id: 'trace1',
        sampled: true,
      },
    ]);
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

  describe('spanToStreamedSpanJSON', () => {
    describe('SentrySpan', () => {
      it('converts a minimal span', () => {
        const span = new SentrySpan();
        expect(spanToStreamedSpanJSON(span)).toEqual({
          span_id: expect.stringMatching(/^[0-9a-f]{16}$/),
          trace_id: expect.stringMatching(/^[0-9a-f]{32}$/),
          name: '',
          start_timestamp: expect.any(Number),
          end_timestamp: expect.any(Number),
          status: 'ok',
          is_segment: true,
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'manual',
          },
        });
      });

      it('converts a full span', () => {
        const span = new SentrySpan({
          op: 'test op',
          name: 'test name',
          parentSpanId: '1234',
          spanId: '5678',
          traceId: 'abcd',
          startTimestamp: 123,
          endTimestamp: 456,
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto',
            attr1: 'value1',
            attr2: 2,
            attr3: true,
          },
          links: [
            {
              context: {
                spanId: 'span1',
                traceId: 'trace1',
                traceFlags: TRACE_FLAG_SAMPLED,
              },
              attributes: {
                'sentry.link.type': 'previous_trace',
              },
            },
          ],
        });
        span.setStatus({ code: SPAN_STATUS_OK });
        span.setAttribute('attr4', [1, 2, 3]);

        expect(spanToStreamedSpanJSON(span)).toEqual({
          name: 'test name',
          parent_span_id: '1234',
          span_id: '5678',
          trace_id: 'abcd',
          start_timestamp: 123,
          end_timestamp: 456,
          status: 'ok',
          is_segment: true,
          attributes: {
            attr1: 'value1',
            attr2: 2,
            attr3: true,
            attr4: [1, 2, 3],
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'test op',
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto',
          },
          links: [
            {
              span_id: 'span1',
              trace_id: 'trace1',
              sampled: true,
              attributes: {
                [SEMANTIC_LINK_ATTRIBUTE_LINK_TYPE]: 'previous_trace',
              },
            },
          ],
        });
      });
    });
    describe('OpenTelemetry Span', () => {
      it('converts a simple span', () => {
        const span = createMockedOtelSpan({
          spanId: 'SPAN-1',
          traceId: 'TRACE-1',
          name: 'test span',
          startTime: 123,
          endTime: [0, 0],
          attributes: {},
          status: { code: SPAN_STATUS_UNSET },
        });

        expect(spanToStreamedSpanJSON(span)).toEqual({
          span_id: 'SPAN-1',
          trace_id: 'TRACE-1',
          parent_span_id: undefined,
          start_timestamp: 123,
          end_timestamp: 0,
          name: 'test span',
          is_segment: true,
          status: 'ok',
          attributes: {},
        });
      });

      it('converts a full span', () => {
        const span = createMockedOtelSpan({
          spanId: 'SPAN-1',
          traceId: 'TRACE-1',
          parentSpanId: 'PARENT-1',
          name: 'test span',
          startTime: 123,
          endTime: 456,
          attributes: {
            attr1: 'value1',
            attr2: 2,
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'test op',
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto',
          },
          links: [
            {
              context: {
                spanId: 'span1',
                traceId: 'trace1',
                traceFlags: TRACE_FLAG_SAMPLED,
              },
              attributes: {
                [SEMANTIC_LINK_ATTRIBUTE_LINK_TYPE]: 'previous_trace',
              },
            },
          ],
          status: { code: SPAN_STATUS_ERROR, message: 'unknown_error' },
        });

        expect(spanToStreamedSpanJSON(span)).toEqual({
          span_id: 'SPAN-1',
          trace_id: 'TRACE-1',
          parent_span_id: 'PARENT-1',
          start_timestamp: 123,
          end_timestamp: 456,
          name: 'test span',
          is_segment: true,
          status: 'error',
          attributes: {
            attr1: 'value1',
            attr2: 2,
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'test op',
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto',
          },
          links: [
            {
              span_id: 'span1',
              trace_id: 'trace1',
              sampled: true,
              attributes: {
                [SEMANTIC_LINK_ATTRIBUTE_LINK_TYPE]: 'previous_trace',
              },
            },
          ],
        });
      });
    });
  });

  describe('streamedSpanJsonToSerializedSpan', () => {
    it('converts a streamed span JSON with links to a serialized span', () => {
      const spanJson: StreamedSpanJSON = {
        name: 'test name',
        parent_span_id: '1234',
        span_id: '5678',
        trace_id: 'abcd',
        start_timestamp: 123,
        end_timestamp: 456,
        status: 'ok',
        is_segment: true,
        attributes: {
          attr1: 'value1',
          attr2: 2,
          attr3: true,
          attr4: [1, 2, 3],
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'test op',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto',
        },
        links: [
          {
            span_id: 'span1',
            trace_id: 'trace1',
            sampled: true,
            attributes: {
              [SEMANTIC_LINK_ATTRIBUTE_LINK_TYPE]: 'previous_trace',
            },
          },
        ],
      };

      expect(streamedSpanJsonToSerializedSpan(spanJson)).toEqual({
        name: 'test name',
        parent_span_id: '1234',
        span_id: '5678',
        trace_id: 'abcd',
        start_timestamp: 123,
        end_timestamp: 456,
        status: 'ok',
        is_segment: true,
        attributes: {
          attr1: { type: 'string', value: 'value1' },
          attr2: { type: 'integer', value: 2 },
          attr3: { type: 'boolean', value: true },
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: { type: 'string', value: 'test op' },
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: { type: 'string', value: 'auto' },
          // notice the absence of `attr4`!
          // for now, we don't yet serialize array attributes. This test will fail
          // once we allow serializing them.
        },
        links: [
          {
            span_id: 'span1',
            trace_id: 'trace1',
            sampled: true,
            attributes: {
              [SEMANTIC_LINK_ATTRIBUTE_LINK_TYPE]: { type: 'string', value: 'previous_trace' },
            },
          },
        ],
      });
    });
  });

  it('returns minimal object for unknown span implementation', () => {
    const span = {
      // This is the minimal interface we require from a span
      spanContext: () => ({
        spanId: 'SPAN-1',
        traceId: 'TRACE-1',
      }),
    };

    expect(spanToJSON(span as unknown as Span)).toEqual({
      span_id: 'SPAN-1',
      trace_id: 'TRACE-1',
      start_timestamp: 0,
      data: {},
    });
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

describe('updateSpanName', () => {
  it('updates the span name and source', () => {
    const span = new SentrySpan({ name: 'old-name', attributes: { [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url' } });
    updateSpanName(span, 'new-name');
    const spanJSON = spanToJSON(span);
    expect(spanJSON.description).toBe('new-name');
    expect(spanJSON.data?.[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]).toBe('custom');
  });
});
