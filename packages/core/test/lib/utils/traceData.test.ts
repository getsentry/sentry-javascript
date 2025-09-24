import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Client } from '../../../src/';
import {
  getCurrentScope,
  getGlobalScope,
  getIsolationScope,
  getMainCarrier,
  getTraceData,
  Scope,
  SentrySpan,
  setAsyncContextStrategy,
  setCurrentClient,
  withActiveSpan,
} from '../../../src/';
import { getAsyncContextStrategy } from '../../../src/asyncContext';
import { freezeDscOnSpan } from '../../../src/tracing/dynamicSamplingContext';
import type { Span } from '../../../src/types-hoist/span';
import type { TestClientOptions } from '../../mocks/client';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';

const dsn = 'https://123@sentry.io/42';

const SCOPE_TRACE_ID = '12345678901234567890123456789012';

function setupClient(opts?: Partial<TestClientOptions>): Client {
  getCurrentScope().setPropagationContext({
    traceId: SCOPE_TRACE_ID,
    sampleRand: Math.random(),
  });

  const options = getDefaultTestClientOptions({
    dsn,
    tracesSampleRate: 1,
    ...opts,
  });
  const client = new TestClient(options);
  setCurrentClient(client);
  client.init();

  return client;
}

describe('getTraceData', () => {
  beforeEach(() => {
    setAsyncContextStrategy(undefined);
    getCurrentScope().clear();
    getIsolationScope().clear();
    getGlobalScope().clear();
    getCurrentScope().setClient(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('uses the ACS implementation, if available', () => {
    setupClient();

    const carrier = getMainCarrier();

    const customFn = vi.fn((options?: { span?: Span }) => {
      expect(options).toEqual({ span: undefined });
      return {
        'sentry-trace': 'abc',
        baggage: 'xyz',
      };
    }) as typeof getTraceData;

    const acs = {
      ...getAsyncContextStrategy(carrier),
      getTraceData: customFn,
    };
    setAsyncContextStrategy(acs);

    const span = new SentrySpan({
      traceId: '12345678901234567890123456789012',
      spanId: '1234567890123456',
      sampled: true,
    });

    withActiveSpan(span, () => {
      const data = getTraceData();

      expect(data).toEqual({
        'sentry-trace': 'abc',
        baggage: 'xyz',
      });
    });
  });

  it('passes span to ACS implementation, if available', () => {
    setupClient();

    const carrier = getMainCarrier();

    const span = new SentrySpan({
      traceId: '12345678901234567890123456789012',
      spanId: '1234567890123456',
      sampled: true,
    });

    const customFn = vi.fn((options?: { span?: Span }) => {
      expect(options).toEqual({ span });
      return {
        'sentry-trace': 'abc',
        baggage: 'xyz',
      };
    }) as typeof getTraceData;

    const acs = {
      ...getAsyncContextStrategy(carrier),
      getTraceData: customFn,
    };
    setAsyncContextStrategy(acs);

    const data = getTraceData({ span });

    expect(data).toEqual({
      'sentry-trace': 'abc',
      baggage: 'xyz',
    });
  });

  it('returns the tracing data from the span, if a span is available', () => {
    setupClient();

    const span = new SentrySpan({
      traceId: '12345678901234567890123456789012',
      spanId: '1234567890123456',
      sampled: true,
    });

    withActiveSpan(span, () => {
      const data = getTraceData();

      expect(data).toEqual({
        'sentry-trace': '12345678901234567890123456789012-1234567890123456-1',
        baggage:
          'sentry-environment=production,sentry-public_key=123,sentry-trace_id=12345678901234567890123456789012,sentry-sampled=true',
      });
    });
  });

  it('allows to pass a span directly', () => {
    setupClient();

    const span = new SentrySpan({
      traceId: '12345678901234567890123456789012',
      spanId: '1234567890123456',
      sampled: true,
    });

    const data = getTraceData({ span });

    expect(data).toEqual({
      'sentry-trace': '12345678901234567890123456789012-1234567890123456-1',
      baggage:
        'sentry-environment=production,sentry-public_key=123,sentry-trace_id=12345678901234567890123456789012,sentry-sampled=true',
    });
  });

  it('allows to pass a scope & client directly', () => {
    // this default client & scope should not be used!
    setupClient();
    getCurrentScope().setPropagationContext({
      traceId: '12345678901234567890123456789099',
      sampleRand: 0.44,
    });

    const options = getDefaultTestClientOptions({
      dsn: 'https://567@sentry.io/42',
      tracesSampleRate: 1,
    });
    const customClient = new TestClient(options);

    const scope = new Scope();
    scope.setPropagationContext({
      traceId: '12345678901234567890123456789012',
      sampleRand: 0.42,
    });
    scope.setClient(customClient);

    const traceData = getTraceData({ client: customClient, scope });

    expect(traceData['sentry-trace']).toMatch(/^12345678901234567890123456789012-[a-f0-9]{16}$/);
    expect(traceData.baggage).toEqual(
      'sentry-environment=production,sentry-public_key=567,sentry-trace_id=12345678901234567890123456789012',
    );
  });

  it('returns propagationContext DSC data if no span is available', () => {
    setupClient();

    getCurrentScope().setPropagationContext({
      traceId: '12345678901234567890123456789012',
      sampled: true,
      parentSpanId: '1234567890123456',
      sampleRand: 0.42,
      dsc: {
        environment: 'staging',
        public_key: 'key',
        trace_id: '12345678901234567890123456789012',
        sample_rand: '0.42',
      },
    });

    const traceData = getTraceData();

    expect(traceData['sentry-trace']).toMatch(/^12345678901234567890123456789012-[a-f0-9]{16}-1$/);
    expect(traceData.baggage).toEqual(
      'sentry-environment=staging,sentry-public_key=key,sentry-trace_id=12345678901234567890123456789012,sentry-sample_rand=0.42',
    );
  });

  it('returns frozen DSC from SentrySpan if available', () => {
    setupClient();

    const span = new SentrySpan({
      traceId: '12345678901234567890123456789012',
      spanId: '1234567890123456',
      sampled: true,
    });

    freezeDscOnSpan(span, {
      environment: 'test-dev',
      public_key: '456',
      trace_id: '12345678901234567890123456789088',
    });

    withActiveSpan(span, () => {
      const data = getTraceData();

      expect(data).toEqual({
        'sentry-trace': '12345678901234567890123456789012-1234567890123456-1',
        baggage: 'sentry-environment=test-dev,sentry-public_key=456,sentry-trace_id=12345678901234567890123456789088',
      });
    });
  });

  it('works with an OTEL span with frozen DSC in traceState', () => {
    setupClient();

    const traceId = '12345678901234567890123456789099';
    const spanId = '1234567890123499';

    const span = new SentrySpan({
      traceId,
      spanId,
      sampled: true,
    });

    span.spanContext = () => {
      const traceState = {
        set: () => traceState,
        unset: () => traceState,
        get: (key: string) => {
          if (key === 'sentry.dsc') {
            return 'sentry-environment=test-dev,sentry-public_key=456,sentry-trace_id=12345678901234567890123456789088';
          }
          return undefined;
        },
        serialize: () => '',
      };

      return {
        traceId,
        spanId,
        sampled: true,
        traceFlags: 1,
        traceState,
      };
    };

    withActiveSpan(span, () => {
      const data = getTraceData();

      expect(data).toEqual({
        'sentry-trace': '12345678901234567890123456789099-1234567890123499-1',
        baggage: 'sentry-environment=test-dev,sentry-public_key=456,sentry-trace_id=12345678901234567890123456789088',
      });
    });
  });

  it('returns empty object without a client', () => {
    const traceData = getTraceData();

    expect(traceData).toEqual({});
  });

  it('returns an empty object if the `sentry-trace` value is invalid', () => {
    // Invalid traceID
    const traceId = '1234567890123456789012345678901+';
    const spanId = '1234567890123499';

    const span = new SentrySpan({
      traceId,
      spanId,
      sampled: true,
    });

    withActiveSpan(span, () => {
      const data = getTraceData();
      expect(data).toEqual({});
    });
  });

  it('returns an empty object if the SDK is disabled', () => {
    setupClient({ dsn: undefined });

    const traceData = getTraceData();

    expect(traceData).toEqual({});
  });

  it('returns traceparent from span if propagateTraceparent is true', () => {
    setupClient();

    const span = new SentrySpan({
      traceId: '12345678901234567890123456789012',
      spanId: '1234567890123456',
      sampled: true,
    });

    withActiveSpan(span, () => {
      const data = getTraceData({ propagateTraceparent: true });

      expect(data).toEqual({
        'sentry-trace': '12345678901234567890123456789012-1234567890123456-1',
        baggage:
          'sentry-environment=production,sentry-public_key=123,sentry-trace_id=12345678901234567890123456789012,sentry-sampled=true',
        traceparent: '00-12345678901234567890123456789012-1234567890123456-01',
      });
    });
  });

  it('returns traceparent from scope in TwP config if propagateTraceparent is true', () => {
    setupClient();

    getCurrentScope().setPropagationContext({
      traceId: '12345678901234567890123456789099',
      sampled: undefined,
      sampleRand: 0.44,
    });

    const traceData = getTraceData({ propagateTraceparent: true });

    expect(traceData.traceparent).toBeDefined();
    expect(traceData.traceparent).toMatch(/00-12345678901234567890123456789099-[0-9a-f]{16}-00/);
  });
});
