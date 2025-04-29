import { describe, expect, it } from 'vitest';
import { SPAN_STATUS_ERROR } from '../../../src/tracing';
import { SentryNonRecordingSpan } from '../../../src/tracing/sentryNonRecordingSpan';
import type { Span } from '../../../src/types-hoist/span';
import { spanIsSampled, spanToJSON, TRACE_FLAG_NONE } from '../../../src/utils/spanUtils';

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
      span_id: expect.stringMatching(/[a-f0-9]{16}/),
      trace_id: expect.stringMatching(/[a-f0-9]{32}/),
      data: {},
      start_timestamp: 0,
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
      span_id: expect.stringMatching(/[a-f0-9]{16}/),
      trace_id: expect.stringMatching(/[a-f0-9]{32}/),
      data: {},
      start_timestamp: 0,
    });
  });
});
