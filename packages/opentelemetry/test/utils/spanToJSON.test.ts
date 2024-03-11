import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, spanToJSON } from '@sentry/core';
import { createSpan } from '../helpers/createSpan';

describe('spanToJSON', () => {
  describe('OpenTelemetry Span', () => {
    it('works with a simple span', () => {
      const span = createSpan('test span', {
        spanId: 'SPAN-1',
        traceId: 'TRACE-1',
        startTime: [123, 0],
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
      const span = createSpan('test span', {
        spanId: 'SPAN-1',
        traceId: 'TRACE-1',
        startTime: [123, 0],
      });

      span.setAttributes({
        attr1: 'value1',
        attr2: 2,
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'test op',
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto',
      });

      span.setStatus({ code: 2, message: 'unknown_error' });
      span.end([456, 0]);

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
});
