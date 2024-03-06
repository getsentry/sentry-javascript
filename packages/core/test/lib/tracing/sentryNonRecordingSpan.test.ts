import type { Span } from '@sentry/types';
import { SPAN_STATUS_ERROR } from '../../../src/tracing';
import { SentryNonRecordingSpan } from '../../../src/tracing/sentryNonRecordingSpan';
import { TRACE_FLAG_NONE, spanIsSampled, spanToJSON } from '../../../src/utils/spanUtils';

describe('SentryNonRecordingSpan', () => {
  it('satisfies the Span interface', () => {
    const span: Span = new SentryNonRecordingSpan();

    expect(span.spanContext()).toEqual({
      spanId: expect.any(String),
      traceId: expect.any(String),
      traceFlags: TRACE_FLAG_NONE,
    });

    expect(spanIsSampled(span)).toBe(false);
    expect(span.isRecording()).toBe(false);
    expect(spanToJSON(span)).toEqual({
      span_id: expect.any(String),
      trace_id: expect.any(String),
    });

    // Ensure all methods work
    span.end();
    span.end(123);
    span.updateName('name');
    span.setAttribute('key', 'value');
    span.setAttributes({ key: 'value' });
    span.setStatus({ code: SPAN_STATUS_ERROR });

    // but nothing is actually set/readable
    expect(spanToJSON(span)).toEqual({
      span_id: expect.any(String),
      trace_id: expect.any(String),
    });
  });
});
