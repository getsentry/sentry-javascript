import { context, defaultTextMapSetter, ROOT_CONTEXT, trace, TraceFlags } from '@opentelemetry/api';
import { TraceState } from '@opentelemetry/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getDscFromTraceState,
  SENTRY_BAGGAGE_HEADER,
  SENTRY_TRACE_HEADER,
  SENTRY_TRACE_STATE_URL,
  _setDscOnTraceState,
} from '../../src/constants';
import { SentryPropagator } from '../../src/propagator';
import { cleanupOtel, mockSdkInit } from '../helpers/mockSdkInit';

describe('traceState DSC helpers', () => {
  it('round-trips DSC values with special characters', () => {
    const dsc = {
      environment: 'production',
      transaction: 'GET /users?id=1&name=foo,bar',
      trace_id: 'abc123',
    };

    const ts = _setDscOnTraceState(new TraceState(), dsc);
    const result = getDscFromTraceState(ts);

    expect(result).toEqual(dsc);
  });

  it('round-trips DSC values with equals signs', () => {
    const dsc = {
      transaction: 'GET /api?foo=bar',
      environment: 'staging',
    };

    const ts = _setDscOnTraceState(new TraceState(), dsc);
    const result = getDscFromTraceState(ts);

    expect(result).toEqual(dsc);
  });

  it('returns undefined for empty traceState', () => {
    const result = getDscFromTraceState(new TraceState());
    expect(result).toBeUndefined();
  });

  it('returns undefined for undefined traceState', () => {
    const result = getDscFromTraceState(undefined);
    expect(result).toBeUndefined();
  });

  it('handles invalid percent encoding gracefully', () => {
    const ts = {
      get: (key: string) => {
        if (key === 'sentry-dsc-environment') {
          return 'bad%value%';
        }
        return undefined;
      },
    };

    const result = getDscFromTraceState(ts);
    expect(result).toEqual({ environment: 'bad%value%' });
  });
});

describe('traceState URL encoding', () => {
  beforeEach(() => {
    mockSdkInit({ tracesSampleRate: 1 });
  });

  afterEach(async () => {
    await cleanupOtel();
  });

  it('does not throw when URL tracestate has invalid percent encoding', () => {
    const propagator = new SentryPropagator();
    const carrier: Record<string, unknown> = {};

    const traceState = new TraceState().set(SENTRY_TRACE_STATE_URL, 'bad%url');
    const spanContext = {
      traceId: 'd4cda95b652f4a1592b449d5929fda1b',
      spanId: '6e0c63257de34c92',
      traceFlags: TraceFlags.SAMPLED,
      traceState,
    };

    const ctx = trace.setSpanContext(ROOT_CONTEXT, spanContext);

    context.with(ctx, () => {
      trace.getTracer('test').startActiveSpan('test', _span => {
        expect(() => propagator.inject(context.active(), carrier, defaultTextMapSetter)).not.toThrow();
        expect(carrier[SENTRY_TRACE_HEADER]).toBeDefined();
        expect(carrier[SENTRY_BAGGAGE_HEADER]).toBeDefined();
      });
    });
  });
});
