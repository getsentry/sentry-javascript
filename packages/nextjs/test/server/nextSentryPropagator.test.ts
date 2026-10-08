import { context, propagation, trace } from '@opentelemetry/api';
import { getCurrentScope, setCurrentClient, startSpan } from '@sentry/core';
import { NodeClient, getDefaultIntegrations } from '@sentry/node';
import { SentryPropagator, SentryTracerProvider } from '@sentry/opentelemetry';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ATTR_NEXT_SPAN_NAME, ATTR_NEXT_SPAN_TYPE } from '../../src/common/nextSpanAttributes';
import {
  NextSentryPropagator,
  isPrerenderContext,
  isPrerenderSpanStart,
  registerNextSentryPropagator,
} from '../../src/server/nextSentryPropagator';

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

function inject(): Record<string, string> {
  const carrier: Record<string, string> = {};
  propagation.inject(context.active(), carrier, {
    set: (c, key, value) => ((c as Record<string, string>)[key] = value),
  });
  return carrier;
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

  it('hands out nothing while a route is prerendered', () => {
    trace.getTracer('next.js').startActiveSpan('prerender route (app) /[id]', PRERENDER_SPAN_OPTIONS, span => {
      expect(isPrerenderContext(context.active())).toBe(true);
      expect(inject()).toEqual({});
      span.end();
    });
  });

  it('hands out nothing inside a span nested in a prerender', () => {
    trace.getTracer('next.js').startActiveSpan('prerender route (app) /[id]', PRERENDER_SPAN_OPTIONS, span => {
      startSpan({ name: 'server component' }, () => {
        expect(inject()).toEqual({});
      });
      span.end();
    });
  });

  it('hands out nothing while a route is prerendered in an unsampled trace', () => {
    setup(0);

    trace.getTracer('next.js').startActiveSpan('GET /[id]', span => {
      expect(span.isRecording()).toBe(false);
      expect(inject()['sentry-trace']).toMatch(/-0$/);

      trace
        .getTracer('next.js')
        .startActiveSpan('prerender route (app) /[id]', PRERENDER_SPAN_OPTIONS, prerenderSpan => {
          expect(prerenderSpan.isRecording()).toBe(false);
          expect(inject()).toEqual({});
          prerenderSpan.end();
        });
      span.end();
    });
  });

  it('marks an explicitly passed context', () => {
    trace
      .getTracer('next.js')
      .startActiveSpan('prerender route (app) /[id]', PRERENDER_SPAN_OPTIONS, context.active(), span => {
        expect(isPrerenderContext(context.active())).toBe(true);
        expect(inject()).toEqual({});
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
