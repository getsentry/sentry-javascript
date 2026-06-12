import { describe, expect, it } from 'vitest';
import { SPAN_STATUS_ERROR } from '../../../src/tracing';
import { SentryNonRecordingSpan } from '../../../src/tracing/sentryNonRecordingSpan';
import type { Span } from '../../../src/types/span';
import {
  getSamplingDecision,
  spanIsSampled,
  spanToJSON,
  spanToTraceHeader,
  TRACE_FLAG_NONE,
} from '../../../src/utils/spanUtils';
import { SENTRY_TRACE_STATE_SAMPLED_NOT_RECORDING, TraceState } from '../../../src/utils/traceState';

describe('SentryNonRecordingSpan', () => {
  it('satisfies the Span interface', () => {
    const span: Span = new SentryNonRecordingSpan();

    expect(span.spanContext()).toEqual({
      spanId: expect.any(String),
      traceId: expect.any(String),
      traceFlags: TRACE_FLAG_NONE,
    });
    expect(getSamplingDecision(span.spanContext())).toBeUndefined();

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

  it('can carry an explicit negative sampling decision', () => {
    const span: Span = new SentryNonRecordingSpan({ sampled: false });

    const spanContext = span.spanContext();
    expect(spanContext).toEqual({
      spanId: expect.any(String),
      traceId: expect.any(String),
      traceFlags: TRACE_FLAG_NONE,
      // A definite negative decision is marked on the trace state,
      // to distinguish it from a deferred decision
      traceState: expect.any(TraceState),
    });
    expect(spanContext.traceState?.get(SENTRY_TRACE_STATE_SAMPLED_NOT_RECORDING)).toBe('1');
    expect(getSamplingDecision(spanContext)).toBe(false);
  });

  it('propagates no sampling decision in trace header when sampled is undefined', () => {
    const span = new SentryNonRecordingSpan({ traceId: 'aabb', spanId: 'ccdd' });
    const header = spanToTraceHeader(span);
    expect(header).toBe('aabb-ccdd');
  });

  it('propagates sampled=false in trace header when explicitly set', () => {
    const span = new SentryNonRecordingSpan({ traceId: 'aabb', spanId: 'ccdd', sampled: false });
    const header = spanToTraceHeader(span);
    expect(header).toBe('aabb-ccdd-0');
  });
});
