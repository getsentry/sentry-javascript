import { context, trace } from '@opentelemetry/api';
import { getCurrentScope, setAsyncContextStrategy } from '@sentry/core';
import { getTraceData } from '../../src/utils/getTraceData';
import { makeTraceState } from '../../src/utils/makeTraceState';
import { cleanupOtel, mockSdkInit } from '../helpers/mockSdkInit';

describe('getTraceData', () => {
  beforeEach(() => {
    setAsyncContextStrategy(undefined);
    mockSdkInit();
  });

  afterEach(() => {
    cleanupOtel();
    jest.clearAllMocks();
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
