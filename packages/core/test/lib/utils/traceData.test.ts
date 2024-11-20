import type { Client, Span } from '@sentry/types';
import {
  SentrySpan,
  getCurrentScope,
  getGlobalScope,
  getIsolationScope,
  getMainCarrier,
  getTraceData,
  setAsyncContextStrategy,
  setCurrentClient,
  withActiveSpan,
} from '../../../src/';
import { getAsyncContextStrategy } from '../../../src/asyncContext';
import { freezeDscOnSpan } from '../../../src/tracing/dynamicSamplingContext';

import { isValidBaggageString } from '../../../src/utils/traceData';
import type { TestClientOptions } from '../../mocks/client';
import { TestClient, getDefaultTestClientOptions } from '../../mocks/client';

const dsn = 'https://123@sentry.io/42';

const SCOPE_TRACE_ID = '12345678901234567890123456789012';
const SCOPE_SPAN_ID = '1234567890123456';

function setupClient(opts?: Partial<TestClientOptions>): Client {
  getCurrentScope().setPropagationContext({
    traceId: SCOPE_TRACE_ID,
    spanId: SCOPE_SPAN_ID,
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
    jest.clearAllMocks();
  });

  it('uses the ACS implementation, if available', () => {
    setupClient();

    const carrier = getMainCarrier();

    const customFn = jest.fn((options?: { span?: Span }) => {
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

    const customFn = jest.fn((options?: { span?: Span }) => {
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

  it('returns propagationContext DSC data if no span is available', () => {
    setupClient();

    getCurrentScope().setPropagationContext({
      traceId: '12345678901234567890123456789012',
      sampled: true,
      spanId: '1234567890123456',
      dsc: {
        environment: 'staging',
        public_key: 'key',
        trace_id: '12345678901234567890123456789012',
      },
    });

    const traceData = getTraceData();

    expect(traceData).toEqual({
      'sentry-trace': '12345678901234567890123456789012-1234567890123456-1',
      baggage: 'sentry-environment=staging,sentry-public_key=key,sentry-trace_id=12345678901234567890123456789012',
    });
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
});

describe('isValidBaggageString', () => {
  it.each([
    'sentry-environment=production',
    'sentry-environment=staging,sentry-public_key=key,sentry-trace_id=abc',
    // @ is allowed in values
    'sentry-release=project@1.0.0',
    // spaces are allowed around the delimiters
    'sentry-environment=staging ,   sentry-public_key=key  ,sentry-release=myproject@1.0.0',
    'sentry-environment=staging ,   thirdparty=value  ,sentry-release=myproject@1.0.0',
    // these characters are explicitly allowed for keys in the baggage spec:
    "!#$%&'*+-.^_`|~1234567890abcxyzABCXYZ=true",
    // special characters in values are fine (except for ",;\ - see other test)
    'key=(value)',
    'key=[{(value)}]',
    'key=some$value',
    'key=more#value',
    'key=max&value',
    'key=max:value',
    'key=x=value',
  ])('returns true if the baggage string is valid (%s)', baggageString => {
    expect(isValidBaggageString(baggageString)).toBe(true);
  });

  it.each([
    // baggage spec doesn't permit leading spaces
    ' sentry-environment=production,sentry-publickey=key,sentry-trace_id=abc',
    // no spaces in keys or values
    'sentry-public key=key',
    'sentry-publickey=my key',
    // no delimiters ("(),/:;<=>?@[\]{}") in keys
    'asdf(x=value',
    'asdf)x=value',
    'asdf,x=value',
    'asdf/x=value',
    'asdf:x=value',
    'asdf;x=value',
    'asdf<x=value',
    'asdf>x=value',
    'asdf?x=value',
    'asdf@x=value',
    'asdf[x=value',
    'asdf]x=value',
    'asdf\\x=value',
    'asdf{x=value',
    'asdf}x=value',
    // no ,;\" in values
    'key=va,lue',
    'key=va;lue',
    'key=va\\lue',
    'key=va"lue"',
    // baggage headers can have properties but we currently don't support them
    'sentry-environment=production;prop1=foo;prop2=bar,nextkey=value',
    // no fishy stuff
    'absolutely not a valid baggage string',
    'val"/><script>alert("xss")</script>',
    'something"/>',
    '<script>alert("xss")</script>',
    '/>',
    '" onblur="alert("xss")',
  ])('returns false if the baggage string is invalid (%s)', baggageString => {
    expect(isValidBaggageString(baggageString)).toBe(false);
  });

  it('returns false if the baggage string is empty', () => {
    expect(isValidBaggageString('')).toBe(false);
  });

  it('returns false if the baggage string is empty', () => {
    expect(isValidBaggageString(undefined)).toBe(false);
  });
});
