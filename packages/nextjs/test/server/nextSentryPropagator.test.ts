import { context, propagation, trace } from '@opentelemetry/api';
import { getCurrentScope, setCurrentClient, startSpan } from '@sentry/core';
import { NodeClient, getDefaultIntegrations } from '@sentry/node';
import { SentryPropagator, SentryTracerProvider } from '@sentry/opentelemetry';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ATTR_NEXT_SPAN_NAME, ATTR_NEXT_SPAN_TYPE } from '../../src/common/nextSpanAttributes';
import { NextSentryPropagator, registerNextSentryPropagator } from '../../src/server/nextSentryPropagator';
import { isPrerenderContext, isPrerenderSpanStart } from '../../src/server/prerenderContext';

const PRERENDER_SPAN_OPTIONS = {
  attributes: {
    [ATTR_NEXT_SPAN_TYPE]: 'AppRender.getBodyResult',
    [ATTR_NEXT_SPAN_NAME]: 'prerender route (app) /[id]',
  },
};

const RENDER_SPAN_OPTIONS = {
  attributes: {
    [ATTR_NEXT_SPAN_TYPE]: 'AppRender.getBodyResult',
    [ATTR_NEXT_SPAN_NAME]: 'render route (app) /blocking',
  },
};

// Next.js collects the meta tag values with an array carrier, see `getTracePropagationData` of its tracer.
function inject(): Record<string, string> {
  const entries: Array<{ key: string; value: string }> = [];
  propagation.inject(context.active(), entries, {
    set: (c, key, value) => (c as typeof entries).push({ key, value }),
  });
  return Object.fromEntries(entries.map(({ key, value }) => [key, value]));
}

function injectHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  propagation.inject(context.active(), headers);
  return headers;
}

function setup(tracesSampleRate: number): void {
  const client = new NodeClient({
    dsn: 'https://public@dsn.ingest.sentry.io/1337',
    tracesSampleRate,
    enableOpenTelemetrySetup: true,
    integrations: getDefaultIntegrations({}),
    stackParser: () => [],
    transport: () => ({ send: () => Promise.resolve({}), flush: () => Promise.resolve(true) }),
  });
  setCurrentClient(client);
  client.init();

  const provider = new SentryTracerProvider();
  trace.setGlobalTracerProvider(provider);
  propagation.setGlobalPropagator(new SentryPropagator());
  registerNextSentryPropagator(provider);
}

describe('NextSentryPropagator', () => {
  beforeEach(() => setup(1));

  afterEach(() => {
    getCurrentScope().setClient(undefined);
    trace.disable();
    context.disable();
    propagation.disable();
    vi.restoreAllMocks();
  });

  it('replaces the registered global propagator', () => {
    const injectSpy = vi.spyOn(NextSentryPropagator.prototype, 'inject');
    inject();
    expect(injectSpy).toHaveBeenCalledTimes(1);
  });

  it('hands out trace context while a route is rendered for a request', () => {
    trace.getTracer('next.js').startActiveSpan('render route (app) /blocking', RENDER_SPAN_OPTIONS, span => {
      expect(isPrerenderContext(context.active())).toBe(false);
      expect(inject()).toEqual({
        'sentry-trace': `${span.spanContext().traceId}-${span.spanContext().spanId}-1`,
        baggage: expect.stringContaining('sentry-trace_id='),
      });
      span.end();
    });
  });

  it('hands out only the trace of the prerender as cache origin while a route is prerendered', () => {
    trace.getTracer('next.js').startActiveSpan('prerender route (app) /[id]', PRERENDER_SPAN_OPTIONS, span => {
      expect(isPrerenderContext(context.active())).toBe(true);
      expect(inject()).toEqual({
        'sentry-cache-origin': `${span.spanContext().traceId}-${span.spanContext().spanId}-1`,
      });
      span.end();
    });
  });

  it('keeps propagating to outgoing requests while a route is prerendered', () => {
    trace.getTracer('next.js').startActiveSpan('prerender route (app) /[id]', PRERENDER_SPAN_OPTIONS, span => {
      expect(inject()).toEqual({ 'sentry-cache-origin': expect.stringMatching(/-1$/) });
      expect(injectHeaders()['sentry-trace']).toBe(`${span.spanContext().traceId}-${span.spanContext().spanId}-1`);
      span.end();
    });
  });

  it('hands out only the cache origin inside a span nested in a prerender', () => {
    trace.getTracer('next.js').startActiveSpan('prerender route (app) /[id]', PRERENDER_SPAN_OPTIONS, span => {
      startSpan({ name: 'server component' }, () => {
        expect(Object.keys(inject())).toEqual(['sentry-cache-origin']);
      });
      span.end();
    });
  });

  it('hands out only the cache origin while a route is prerendered in an unsampled trace', () => {
    setup(0);

    trace.getTracer('next.js').startActiveSpan('GET /[id]', span => {
      expect(span.isRecording()).toBe(false);
      expect(inject()['sentry-trace']).toMatch(/-0$/);

      trace
        .getTracer('next.js')
        .startActiveSpan('prerender route (app) /[id]', PRERENDER_SPAN_OPTIONS, prerenderSpan => {
          expect(prerenderSpan.isRecording()).toBe(false);
          expect(inject()).toEqual({ 'sentry-cache-origin': expect.stringMatching(/-0$/) });
          prerenderSpan.end();
        });
      span.end();
    });
  });

  it('recognizes a prerender span that was started inactive and activated by the caller', () => {
    const span = trace.getTracer('next.js').startSpan('prerender route (app) /[id]', PRERENDER_SPAN_OPTIONS);
    context.with(trace.setSpan(context.active(), span), () => {
      expect(isPrerenderContext(context.active())).toBe(true);
      expect(Object.keys(inject())).toEqual(['sentry-cache-origin']);
    });
    span.end();

    const renderSpan = trace.getTracer('next.js').startSpan('render route (app) /blocking', RENDER_SPAN_OPTIONS);
    context.with(trace.setSpan(context.active(), renderSpan), () => {
      expect(inject()['sentry-trace']).toBeDefined();
    });
    renderSpan.end();
  });

  it('marks an explicitly passed context', () => {
    trace
      .getTracer('next.js')
      .startActiveSpan('prerender route (app) /[id]', PRERENDER_SPAN_OPTIONS, context.active(), span => {
        expect(isPrerenderContext(context.active())).toBe(true);
        expect(Object.keys(inject())).toEqual(['sentry-cache-origin']);
        span.end();
      });
  });

  it('does not mistake other Next.js spans for a prerender', () => {
    expect(
      isPrerenderSpanStart('prerender route (app) /x', {
        attributes: { [ATTR_NEXT_SPAN_TYPE]: 'NextNodeServer.getLayoutOrPageModule' },
      }),
    ).toBe(false);
    expect(isPrerenderSpanStart('prerender route (app) /x', undefined)).toBe(false);
    expect(isPrerenderSpanStart('prerender route (app) /x', PRERENDER_SPAN_OPTIONS)).toBe(true);
  });
});
