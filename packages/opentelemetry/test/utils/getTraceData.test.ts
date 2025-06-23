import { context, trace } from '@opentelemetry/api';
import { getCurrentScope, Scope, setAsyncContextStrategy } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getTraceData } from '../../src/utils/getTraceData';
import { makeTraceState } from '../../src/utils/makeTraceState';
import { cleanupOtel, mockSdkInit } from '../helpers/mockSdkInit';
import { getDefaultTestClientOptions, TestClient } from '../helpers/TestClient';

describe('getTraceData', () => {
  beforeEach(() => {
    setAsyncContextStrategy(undefined);
    mockSdkInit();
  });

  afterEach(async () => {
    await cleanupOtel();
    vi.clearAllMocks();
  });

  it('returns the tracing data from the span, if a span is available', () => {
    const ctx = trace.setSpanContext(context.active(), {
      traceId: '12345678901234567890123456789012',
      spanId: '1234567890123456',
      traceFlags: 1,
    });

    context.with(ctx, () => {
      const data = getTraceData();

      expect(data).toEqual({
        'sentry-trace': '12345678901234567890123456789012-1234567890123456-1',
        baggage:
          'sentry-environment=production,sentry-public_key=username,sentry-trace_id=12345678901234567890123456789012,sentry-sampled=true',
      });
    });
  });

  it('allows to pass a span directly', () => {
    const ctx = trace.setSpanContext(context.active(), {
      traceId: '12345678901234567890123456789012',
      spanId: '1234567890123456',
      traceFlags: 1,
    });

    const span = trace.getSpan(ctx)!;

    const data = getTraceData({ span });

    expect(data).toEqual({
      'sentry-trace': '12345678901234567890123456789012-1234567890123456-1',
      baggage:
        'sentry-environment=production,sentry-public_key=username,sentry-trace_id=12345678901234567890123456789012,sentry-sampled=true',
    });
  });

  it('allows to pass a scope & client directly', () => {
    getCurrentScope().setPropagationContext({
      traceId: '12345678901234567890123456789099',
      sampleRand: 0.44,
    });

    const customClient = new TestClient(
      getDefaultTestClientOptions({ tracesSampleRate: 1, dsn: 'https://123@sentry.io/42' }),
    );

    // note: Right now, this only works properly if the scope is linked to a context
    const scope = new Scope();
    scope.setPropagationContext({
      traceId: '12345678901234567890123456789012',
      sampleRand: 0.42,
    });
    scope.setClient(customClient);

    const traceData = getTraceData({ client: customClient, scope });

    expect(traceData['sentry-trace']).toMatch(/^12345678901234567890123456789012-[a-f0-9]{16}$/);
    expect(traceData.baggage).toEqual(
      'sentry-environment=production,sentry-public_key=123,sentry-trace_id=12345678901234567890123456789012',
    );
  });

  it('returns propagationContext DSC data if no span is available', () => {
    getCurrentScope().setPropagationContext({
      traceId: '12345678901234567890123456789012',
      sampleRand: Math.random(),
      sampled: true,
      dsc: {
        environment: 'staging',
        public_key: 'key',
        trace_id: '12345678901234567890123456789012',
      },
    });

    const traceData = getTraceData();

    expect(traceData['sentry-trace']).toMatch(/^12345678901234567890123456789012-[a-f0-9]{16}-1$/);
    expect(traceData.baggage).toEqual(
      'sentry-environment=staging,sentry-public_key=key,sentry-trace_id=12345678901234567890123456789012',
    );
  });

  it('works with an span with frozen DSC in traceState', () => {
    const ctx = trace.setSpanContext(context.active(), {
      traceId: '12345678901234567890123456789012',
      spanId: '1234567890123456',
      traceFlags: 1,
      traceState: makeTraceState({
        dsc: { environment: 'test-dev', public_key: '456', trace_id: '12345678901234567890123456789088' },
      }),
    });

    context.with(ctx, () => {
      const data = getTraceData();

      expect(data).toEqual({
        'sentry-trace': '12345678901234567890123456789012-1234567890123456-1',
        baggage: 'sentry-environment=test-dev,sentry-public_key=456,sentry-trace_id=12345678901234567890123456789088',
      });
    });
  });
});
