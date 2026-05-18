import { context, SpanKind, trace, TraceFlags } from '@opentelemetry/api';
import {
  continueTrace,
  getActiveSpan,
  getDynamicSamplingContextFromSpan,
  getRootSpan,
  spanToJSON,
  SPAN_STATUS_ERROR,
  startSpanManual,
  type Span,
} from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SentryAsyncLocalStorageContextManager } from '../src/asyncLocalStorageContextManager';
import { setOpenTelemetryContextAsyncContextStrategy } from '../src/asyncContextStrategy';
import {
  _INTERNAL_getSpanForRecordedException,
  applyOtelSpanData,
  SentryTraceProvider,
} from '../src/sentryTraceProvider';
import { cleanupOtel } from './helpers/mockSdkInit';
import { init as initTestClient } from './helpers/TestClient';

describe('SentryTraceProvider', () => {
  beforeEach(() => {
    (global as { __SENTRY__?: unknown }).__SENTRY__ = {};
    setOpenTelemetryContextAsyncContextStrategy({ useOpenTelemetrySpanCreation: false });
    initTestClient({ tracesSampleRate: 1 });
    context.setGlobalContextManager(new SentryAsyncLocalStorageContextManager());
    trace.setGlobalTracerProvider(new SentryTraceProvider());
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

  it('does not replace active core spans with provider-created OpenTelemetry spans', () => {
    const tracer = trace.getTracer('test');

    tracer.startActiveSpan('otel-parent', otelParent => {
      startSpanManual({ name: 'sentry-parent' }, sentryParent => {
        const otelChild = tracer.startSpan('otel-child');
        const otelChildContext = trace.setSpan(context.active(), otelChild);

        context.with(otelChildContext, () => {
          expect(getActiveSpan()).toBe(sentryParent);
        });

        otelChild.end();
        sentryParent.end();
      });

      otelParent.end();
    });
  });

  it('parents core spans to the active OpenTelemetry span in context-only mode', () => {
    trace.getTracer('test').startActiveSpan('parent', parent => {
      startSpanManual({ name: 'child' }, child => {
        expect(spanToJSON(child).parent_span_id).toBe(parent.spanContext().spanId);
        child.end();
      });
    });
  });

  it('continues remote OpenTelemetry contexts as root core spans in context-only mode', () => {
    const traceId = '12312012123120121231201212312012';
    const parentSpanId = '1121201211212012';
    const remoteContext = trace.setSpanContext(context.active(), {
      traceId,
      spanId: parentSpanId,
      isRemote: true,
      traceFlags: TraceFlags.SAMPLED,
    });

    context.with(remoteContext, () => {
      continueTrace({ sentryTrace: `${traceId}-${parentSpanId}-1`, baggage: undefined }, () => {
        startSpanManual({ name: 'server' }, span => {
          expect(getRootSpan(span)).toBe(span);
          expect(spanToJSON(span)).toMatchObject({
            trace_id: traceId,
            parent_span_id: parentSpanId,
          });
          expect(getDynamicSamplingContextFromSpan(span)).toEqual({});
          span.end();
        });
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

  it('remembers the closest provider-created span that recorded an exception', () => {
    const error = new Error('test error');

    trace.getTracer('test').startActiveSpan('outer', outer => {
      let innerSpan: unknown;

      trace.getTracer('test').startActiveSpan('inner', inner => {
        innerSpan = inner;
        inner.recordException(error);
        inner.end();
      });

      outer.recordException(error);

      expect(_INTERNAL_getSpanForRecordedException(error)).toBe(innerSpan);
      outer.end();
    });
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

  it('does not keep default custom source on provider-created spans', () => {
    const span = trace.getTracer('test').startSpan('custom-source');
    span.setAttribute('sentry.source', 'custom');

    applyOtelSpanData(span as Span, { finalizeStatus: true });

    expect(spanToJSON(span as Span).data?.['sentry.source']).toBeUndefined();
  });
});
