import { context, trace, TraceFlags } from '@opentelemetry/api';
import { TraceState } from '@opentelemetry/core';
import { afterEach, describe, expect, it } from 'vitest';
import { SENTRY_TRACE_STATE_CHILD_IGNORED } from '../src/constants';
import { cleanupOtel, mockSdkInit } from './helpers/mockSdkInit';

describe('SentryContextManager', () => {
  afterEach(async () => {
    await cleanupOtel();
  });

  it('removes ignored spans from context so children parent to grandparent', () => {
    mockSdkInit({ tracesSampleRate: 1 });

    const ignoredTraceState = new TraceState().set(SENTRY_TRACE_STATE_CHILD_IGNORED, '1');
    const ignoredSpanContext = {
      traceId: '00000000000000000000000000000001',
      spanId: '0000000000000001',
      traceFlags: TraceFlags.NONE,
      traceState: ignoredTraceState,
    };

    const ctxWithIgnored = trace.setSpanContext(context.active(), ignoredSpanContext);

    context.with(ctxWithIgnored, () => {
      const activeSpan = trace.getSpan(context.active());
      expect(activeSpan).toBeUndefined();
    });
  });

  it('preserves non-ignored spans in context', () => {
    mockSdkInit({ tracesSampleRate: 1 });

    const normalSpanContext = {
      traceId: '00000000000000000000000000000001',
      spanId: '0000000000000001',
      traceFlags: TraceFlags.SAMPLED,
    };

    const ctxWithSpan = trace.setSpanContext(context.active(), normalSpanContext);

    context.with(ctxWithSpan, () => {
      const activeSpan = trace.getSpan(context.active());
      expect(activeSpan).toBeDefined();
      expect(activeSpan?.spanContext().spanId).toBe('0000000000000001');
    });
  });
});
