import { context, SpanKind, trace, TraceFlags } from '@opentelemetry/api';
import { suppressTracing } from '@opentelemetry/core';
import {
  getActiveSpan,
  getCapturedScopesOnSpan,
  getRootSpan,
  spanToJSON,
  SPAN_STATUS_ERROR,
  SPAN_STATUS_OK,
  startSpanManual,
  type Span,
  withIsolationScope,
} from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SentryAsyncLocalStorageContextManager } from '../src/asyncLocalStorageContextManager';
import { setOpenTelemetryContextAsyncContextStrategy } from '../src/asyncContextStrategy';
import { applyOtelSpanData } from '../src/applyOtelSpanData';
import { SentryTracerProvider } from '../src/tracerProvider';
import { cleanupOtel } from './helpers/mockSdkInit';
import { init as initTestClient } from './helpers/TestClient';

describe('SentryTracerProvider', () => {
  beforeEach(() => {
    (global as { __SENTRY__?: unknown }).__SENTRY__ = {};
    setOpenTelemetryContextAsyncContextStrategy();
    initTestClient({ tracesSampleRate: 1 });
    context.setGlobalContextManager(new SentryAsyncLocalStorageContextManager());
    trace.setGlobalTracerProvider(new SentryTracerProvider());
  });

  afterEach(async () => {
    await cleanupOtel();
  });

  it('creates Sentry spans from the global OpenTelemetry tracer', () => {
    const span = trace.getTracer('test').startSpan('SELECT users', {
      attributes: {
        'db.system.name': 'postgresql',
        'db.statement': 'SELECT * FROM users',
      },
    });

    expect(spanToJSON(span as Span)).toEqual({
      data: {
        'sentry.origin': 'manual',
        'sentry.op': 'db',
        'sentry.sample_rate': 1,
        'sentry.source': 'task',
        'db.system.name': 'postgresql',
        'db.statement': 'SELECT * FROM users',
      },
      description: 'SELECT * FROM users',
      op: 'db',
      origin: 'manual',
      parent_span_id: undefined,
      span_id: span.spanContext().spanId,
      start_timestamp: expect.any(Number),
      status: undefined,
      timestamp: undefined,
      trace_id: span.spanContext().traceId,
      profile_id: undefined,
      exclusive_time: undefined,
      measurements: undefined,
      is_segment: undefined,
      segment_id: undefined,
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
    expect(json.data?.['otel.kind']).toBe('SERVER');
  });

  it('finalizes span statuses like the OpenTelemetry exporter', () => {
    const okSpan = trace.getTracer('test').startSpan('ok');
    applyOtelSpanData(okSpan as Span, { finalizeStatus: true });
    expect(spanToJSON(okSpan as Span).status).toBe('ok');

    const httpErrorSpan = trace.getTracer('test').startSpan('http-error');
    httpErrorSpan.setAttribute('http.response.status_code', 500);
    applyOtelSpanData(httpErrorSpan as Span, { finalizeStatus: true });
    expect(spanToJSON(httpErrorSpan as Span).status).toBe('internal_error');

    const legacyHttpErrorSpan = trace.getTracer('test').startSpan('legacy-http-error');
    legacyHttpErrorSpan.setAttribute('http.status_code', 500);
    applyOtelSpanData(legacyHttpErrorSpan as Span, { finalizeStatus: true });
    expect(spanToJSON(legacyHttpErrorSpan as Span).status).toBe('internal_error');
    expect(spanToJSON(legacyHttpErrorSpan as Span).data).toMatchObject({
      'http.response.status_code': 500,
      'http.status_code': 500,
    });

    const customErrorSpan = trace.getTracer('test').startSpan('custom-error');
    customErrorSpan.setStatus({ code: SPAN_STATUS_ERROR, message: 'This is a custom error' });
    applyOtelSpanData(customErrorSpan as Span, { finalizeStatus: true });
    expect(spanToJSON(customErrorSpan as Span).status).toBe('internal_error');
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

    expect(spanToJSON(span as Span).data?.['sentry.source']).toBe('custom');
  });

  it('infers route source, op, and name for HTTP server spans', () => {
    const span = trace.getTracer('test').startSpan('GET', {
      kind: SpanKind.SERVER,
      attributes: {
        'http.method': 'GET',
        'http.route': '/my-path/:id',
      },
    });

    const json = spanToJSON(span as Span);
    expect(json.op).toBe('http.server');
    expect(json.data?.['sentry.source']).toBe('route');
    expect(json.description).toBe('GET /my-path/:id');
  });

  it('defers url source to span end, keeping custom for the DSC at creation', () => {
    const span = trace.getTracer('test').startSpan('POST', {
      kind: SpanKind.SERVER,
      attributes: {
        'http.method': 'POST',
        'http.url': 'https://www.example.com/my-path',
        'http.target': '/my-path',
      },
    });

    // At creation op and name are inferred, but the `url` source is intentionally
    // deferred so the default `custom` source survives for the DSC transaction name
    // (http.route is often not available yet at this point).
    const atCreation = spanToJSON(span as Span);
    expect(atCreation.op).toBe('http.server');
    expect(atCreation.description).toBe('POST /my-path');
    expect(atCreation.data?.['sentry.source']).toBe('custom');

    // At span end the inferred `url` source is applied.
    applyOtelSpanData(span as Span, { finalizeStatus: true });
    expect(spanToJSON(span as Span).data?.['sentry.source']).toBe('url');
  });
});
