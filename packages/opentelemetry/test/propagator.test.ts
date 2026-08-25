import { context, defaultTextMapGetter, defaultTextMapSetter, ROOT_CONTEXT, trace } from '@opentelemetry/api';
import { suppressTracing, withScope } from '@sentry/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { SENTRY_BAGGAGE_HEADER, SENTRY_TRACE_HEADER } from '../src/constants';
import { SentryPropagator } from '../src/propagator';
import { mockSdkInit } from './helpers/mockSdkInit';

const TRACE_ID = 'd4cda95b652f4a1592b449d5929fda1b';
const PARENT_SPAN_ID = '6e0c63257de34c93';

describe('SentryPropagator', () => {
  const propagator = new SentryPropagator();

  beforeEach(() => {
    mockSdkInit({
      environment: 'production',
      release: '1.0.0',
      tracesSampleRate: 1,
      dsn: 'https://abc@domain/123',
    });
  });

  it('returns fields set', () => {
    expect(propagator.fields()).toEqual([SENTRY_TRACE_HEADER, SENTRY_BAGGAGE_HEADER, 'traceparent']);
  });

  describe('inject', () => {
    it('injects sentry-trace and baggage from the scope propagation context', () => {
      const carrier: Record<string, unknown> = {};

      withScope(scope => {
        scope.setPropagationContext({
          traceId: TRACE_ID,
          parentSpanId: PARENT_SPAN_ID,
          sampled: true,
          sampleRand: 0.42,
        });

        propagator.inject(context.active(), carrier, defaultTextMapSetter);
      });

      expect(carrier[SENTRY_TRACE_HEADER]).toMatch(new RegExp(`^${TRACE_ID}-[a-f0-9]{16}-1$`));
      expect(carrier[SENTRY_BAGGAGE_HEADER]).toContain(`sentry-trace_id=${TRACE_ID}`);
      expect(carrier[SENTRY_BAGGAGE_HEADER]).toContain('sentry-environment=production');
    });

    it('injects the trace data of an active span', () => {
      const carrier: Record<string, unknown> = {};

      const spanContext = {
        traceId: TRACE_ID,
        spanId: '6e0c63257de34c92',
        traceFlags: 1,
      };
      const ctx = trace.setSpanContext(ROOT_CONTEXT, spanContext);

      context.with(ctx, () => {
        propagator.inject(context.active(), carrier, defaultTextMapSetter);
      });

      expect(carrier[SENTRY_TRACE_HEADER]).toBe(`${TRACE_ID}-6e0c63257de34c92-1`);
    });

    it('does not inject anything when tracing is suppressed', () => {
      const carrier: Record<string, unknown> = {};

      const spanContext = {
        traceId: TRACE_ID,
        spanId: '6e0c63257de34c92',
        traceFlags: 1,
      };
      const ctx = trace.setSpanContext(ROOT_CONTEXT, spanContext);

      suppressTracing(() => {
        context.with(ctx, () => {
          propagator.inject(context.active(), carrier, defaultTextMapSetter);
        });
      });

      expect(carrier[SENTRY_TRACE_HEADER]).toBeUndefined();
      expect(carrier[SENTRY_BAGGAGE_HEADER]).toBeUndefined();
    });
  });

  describe('extract', () => {
    it('continues an incoming trace as a remote active span', () => {
      const carrier = {
        [SENTRY_TRACE_HEADER]: `${TRACE_ID}-${PARENT_SPAN_ID}-1`,
        [SENTRY_BAGGAGE_HEADER]: 'sentry-environment=production,sentry-public_key=abc',
      };

      const extractedContext = propagator.extract(context.active(), carrier, defaultTextMapGetter);

      const spanContext = trace.getSpanContext(extractedContext);
      expect(spanContext?.traceId).toBe(TRACE_ID);
      expect(spanContext?.spanId).toBe(PARENT_SPAN_ID);
      expect(spanContext?.isRemote).toBe(true);
    });

    it('handles an array-valued sentry-trace header', () => {
      const carrier = {
        [SENTRY_TRACE_HEADER]: [`${TRACE_ID}-${PARENT_SPAN_ID}-1`],
      };

      const getter = {
        keys: (c: Record<string, unknown>) => Object.keys(c),
        get: (c: Record<string, unknown>, key: string) => c[key] as string | string[] | undefined,
      };

      const extractedContext = propagator.extract(context.active(), carrier, getter);

      const spanContext = trace.getSpanContext(extractedContext);
      expect(spanContext?.traceId).toBe(TRACE_ID);
      expect(spanContext?.spanId).toBe(PARENT_SPAN_ID);
    });

    it('returns the context unchanged when there is no incoming trace', () => {
      const carrier = {};

      const extractedContext = propagator.extract(context.active(), carrier, defaultTextMapGetter);

      expect(trace.getSpanContext(extractedContext)).toBeUndefined();
    });
  });
});
