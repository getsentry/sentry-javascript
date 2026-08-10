import { context, SpanKind, trace, TraceFlags } from '@opentelemetry/api';
import { suppressTracing } from '../src/utils/suppressTracing';
import {
  getActiveSpan,
  getCapturedScopesOnSpan,
  getRootSpan,
  spanToJSON,
  spanToStaticSpanJSON,
  SPAN_STATUS_ERROR,
  SPAN_STATUS_OK,
  startSpanManual,
  type Span,
  withIsolationScope,
} from '@sentry/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { applyOtelSpanData } from '../src/applyOtelSpanData';
import { mockSdkInit } from './helpers/mockSdkInit';
import { init as initTestClient } from './helpers/TestClient';

describe('SentryTracerProvider', () => {
  beforeEach(() => {
    mockSdkInit({ tracesSampleRate: 1 });
  });

  it('creates Sentry spans from the global OpenTelemetry tracer', () => {
    const span = trace.getTracer('test').startSpan('SELECT users', {
      attributes: {
        'db.system.name': 'postgresql',
        'db.statement': 'SELECT * FROM users',
      },
    });

    expect(spanToJSON(span as Span)).toEqual({
      attributes: {
        'sentry.origin': 'manual',
        'sentry.sample_rate': 1,
        'db.system.name': 'postgresql',
        'db.statement': 'SELECT * FROM users',
        'sentry.source': 'custom',
      },
      name: 'SELECT users',
      parent_span_id: undefined,
      span_id: span.spanContext().spanId,
      start_timestamp: expect.any(Number),
      end_timestamp: undefined,
      is_segment: true,
      status: 'ok',
      trace_id: span.spanContext().traceId,
      links: undefined,
    });
  });

  it('parents inactive spans to the active OpenTelemetry span', () => {
    trace.getTracer('test').startActiveSpan('parent', parent => {
      const child = trace.getTracer('test').startSpan('child');

      expect(spanToJSON(child as Span).parent_span_id).toBe(parent.spanContext().spanId);
    });
  });

  it('links non-recording spans to a suppressed active parent', () => {
    trace.getTracer('test').startActiveSpan('parent', parent => {
      const suppressedContext = suppressTracing(context.active());
      const child = trace.getTracer('test').startSpan('child', {}, suppressedContext);

      expect(child.isRecording()).toBe(false);
      expect(spanToJSON(child as Span).trace_id).toBe(parent.spanContext().traceId);
      // Non-recording spans no longer carry a `parent_span_id` under the scope-based
      // sampling model; the child is instead linked to the parent's span tree.
      expect(getRootSpan(child as Span)).toBe(getRootSpan(parent as unknown as Span));

      parent.end();
    });
  });

  it('captures scopes on suppressed spans so startActiveSpan can fork the isolation scope', () => {
    withIsolationScope(isolationScope => {
      const suppressedContext = suppressTracing(context.active());
      const span = trace.getTracer('test').startSpan('child', {}, suppressedContext);

      // Without captured scopes, startActiveSpan cannot fork the isolation scope onto the context.
      expect(getCapturedScopesOnSpan(span as unknown as Span).isolationScope).toBe(isolationScope);
    });
  });

  it('sets active OpenTelemetry spans on the Sentry scope', () => {
    trace.getTracer('test').startActiveSpan('parent', parent => {
      expect(getActiveSpan()).toBe(parent);
    });
  });

  it('syncs manual OpenTelemetry context switches onto the Sentry scope', () => {
    const tracer = trace.getTracer('test');

    tracer.startActiveSpan('parent', parent => {
      const child = tracer.startSpan('child');
      const childContext = trace.setSpan(context.active(), child);

      context.with(childContext, () => {
        expect(getActiveSpan()).toBe(child);
      });

      expect(getActiveSpan()).toBe(parent);

      child.end();
      parent.end();
    });
  });

  it('parents core spans to the active OpenTelemetry span', () => {
    trace.getTracer('test').startActiveSpan('parent', parent => {
      startSpanManual({ name: 'child' }, child => {
        expect(spanToJSON(child).parent_span_id).toBe(parent.spanContext().spanId);
        child.end();
      });
    });
  });

  it('continues remote OpenTelemetry span contexts as root Sentry spans', () => {
    const remoteContext = trace.setSpanContext(context.active(), {
      traceId: '12312012123120121231201212312012',
      spanId: '1121201211212012',
      isRemote: true,
      traceFlags: TraceFlags.SAMPLED,
    });

    const span = trace.getTracer('test').startSpan('server', { kind: SpanKind.SERVER }, remoteContext);
    const json = spanToJSON(span as Span);

    expect(json.trace_id).toBe('12312012123120121231201212312012');
    expect(json.parent_span_id).toBe('1121201211212012');
    expect(json.attributes['sentry.kind']).toBe('server');
  });

  it('finalizes span statuses like the OpenTelemetry exporter', () => {
    const okSpan = trace.getTracer('test').startSpan('ok');
    applyOtelSpanData(okSpan as Span, { finalizeStatus: true });
    expect(spanToStaticSpanJSON(okSpan as Span).status).toBe('ok');
    expect(spanToJSON(okSpan as Span).status).toBe('ok');
    expect(spanToJSON(okSpan as Span).attributes).not.toHaveProperty('sentry.status.message');

    const httpErrorSpan = trace.getTracer('test').startSpan('http-error');
    httpErrorSpan.setAttribute('http.response.status_code', 500);
    applyOtelSpanData(httpErrorSpan as Span, { finalizeStatus: true });
    expect(spanToStaticSpanJSON(httpErrorSpan as Span).status).toBe('internal_error');
    expect(spanToJSON(httpErrorSpan as Span).status).toBe('error');
    expect(spanToJSON(httpErrorSpan as Span).attributes).toMatchObject({
      'sentry.status.message': 'internal_error',
    });

    const customErrorSpan = trace.getTracer('test').startSpan('custom-error');
    customErrorSpan.setStatus({ code: SPAN_STATUS_ERROR, message: 'This is a custom error' });
    applyOtelSpanData(customErrorSpan as Span, { finalizeStatus: true });
    expect(spanToStaticSpanJSON(customErrorSpan as Span).status).toBe('internal_error');
  });

  it('preserves an explicit OK status when finalizing', () => {
    const span = trace.getTracer('test').startSpan('explicit-ok');
    span.setStatus({ code: SPAN_STATUS_OK });

    applyOtelSpanData(span as Span, { finalizeStatus: true });

    expect(spanToJSON(span as Span).status).toBe('ok');
  });

  it('keeps default custom source on provider-created spans', () => {
    const span = trace.getTracer('test').startSpan('custom-source');
    span.setAttribute('sentry.source', 'custom');

    applyOtelSpanData(span as Span, { finalizeStatus: true });

    expect(spanToJSON(span as Span).attributes['sentry.source']).toBe('custom');
  });

  it('preserves a non-canonical error status message under span streaming', () => {
    // Under streaming the streamed serializer surfaces the raw message as `sentry.status.message`, so
    // finalizing must not overwrite the live span status. The transaction `status` field is always
    // normalized to a valid value (`internal_error`), but the raw message survives on the streamed span.
    initTestClient({ tracesSampleRate: 1, traceLifecycle: 'stream' });
    const span = trace.getTracer('test').startSpan('db-error');
    span.setStatus({ code: SPAN_STATUS_ERROR, message: 'Cannot enqueue Query after fatal error.' });

    applyOtelSpanData(span as Span, { finalizeStatus: true });

    const streamed = spanToJSON(span as Span);
    expect(streamed.status).toBe('error');
    expect(streamed.attributes?.['sentry.status.message']).toBe('Cannot enqueue Query after fatal error.');
  });
});
