import { SentrySpan, getTraceData } from '../../../src/';
import * as SentryCoreCurrentScopes from '../../../src/currentScopes';
import * as SentryCoreExports from '../../../src/exports';
import * as SentryCoreTracing from '../../../src/tracing';
import * as SentryCoreTracingDsc from '../../../src/tracing/dynamicSamplingContext';
import { freezeDscOnSpan } from '../../../src/tracing/dynamicSamplingContext';
import * as SentryCoreSpanUtils from '../../../src/utils/spanUtils';

import { isValidBaggageString } from '../../../src/utils/traceData';

const TRACE_FLAG_SAMPLED = 1;

const mockedClient = {} as any;

const mockedScope = {
  getPropagationContext: () => ({
    traceId: '123',
    spanId: '456',
  }),
} as any;

describe('getTraceData', () => {
  beforeEach(() => {
    jest.spyOn(SentryCoreExports, 'isEnabled').mockReturnValue(true);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns the tracing data from the span, if a span is available', () => {
    {
      const mockedSpan = new SentrySpan({
        traceId: '12345678901234567890123456789012',
        spanId: '1234567890123456',
        sampled: true,
      });
      freezeDscOnSpan(mockedSpan, { environment: 'production' });

      jest.spyOn(SentryCoreSpanUtils, 'getActiveSpan').mockImplementation(() => mockedSpan);
      jest.spyOn(SentryCoreCurrentScopes, 'getCurrentScope').mockImplementation(() => mockedScope);
      jest.spyOn(SentryCoreCurrentScopes, 'getClient').mockImplementation(() => mockedClient);

      const data = getTraceData();

      expect(data).toEqual({
        'sentry-trace': '12345678901234567890123456789012-1234567890123456-1',
        baggage: 'sentry-environment=production',
      });
    }
  });

  it('returns propagationContext DSC data if no span is available', () => {
    jest.spyOn(SentryCoreSpanUtils, 'getActiveSpan').mockImplementation(() => undefined);
    jest.spyOn(SentryCoreCurrentScopes, 'getCurrentScope').mockImplementation(
      () =>
        ({
          getPropagationContext: () => ({
            traceId: '12345678901234567890123456789012',
            sampled: true,
            spanId: '1234567890123456',
            dsc: {
              environment: 'staging',
              public_key: 'key',
              trace_id: '12345678901234567890123456789012',
            },
          }),
        }) as any,
    );
    jest.spyOn(SentryCoreCurrentScopes, 'getClient').mockImplementation(() => mockedClient);

    const traceData = getTraceData();

    expect(traceData).toEqual({
      'sentry-trace': expect.stringMatching(/12345678901234567890123456789012-(.{16})-1/),
      baggage: 'sentry-environment=staging,sentry-public_key=key,sentry-trace_id=12345678901234567890123456789012',
    });
  });

  it('returns only the `sentry-trace` value if no DSC is available', () => {
    jest.spyOn(SentryCoreTracingDsc, 'getDynamicSamplingContextFromSpan').mockReturnValue({
      trace_id: '',
      public_key: undefined,
    });

    // @ts-expect-error - we don't need to provide all the properties
    jest.spyOn(SentryCoreSpanUtils, 'getActiveSpan').mockImplementation(() => ({
      isRecording: () => true,
      spanContext: () => {
        return {
          traceId: '12345678901234567890123456789012',
          spanId: '1234567890123456',
          traceFlags: TRACE_FLAG_SAMPLED,
        };
      },
    }));

    jest.spyOn(SentryCoreCurrentScopes, 'getCurrentScope').mockImplementation(() => mockedScope);
    jest.spyOn(SentryCoreCurrentScopes, 'getClient').mockImplementation(() => {
      return {
        getOptions: () => ({}),
        getDsn: () => ({}),
      } as any;
    });

    const traceData = getTraceData();

    expect(traceData).toEqual({
      'sentry-trace': '12345678901234567890123456789012-1234567890123456-1',
    });
  });

  it('returns empty object without a client', () => {
    jest.spyOn(SentryCoreTracing, 'getDynamicSamplingContextFromClient').mockReturnValueOnce({
      trace_id: '',
      public_key: undefined,
    });

    // @ts-expect-error - we don't need to provide all the properties
    jest.spyOn(SentryCoreSpanUtils, 'getActiveSpan').mockImplementation(() => ({
      isRecording: () => true,
      spanContext: () => {
        return {
          traceId: '12345678901234567890123456789012',
          spanId: '1234567890123456',
          traceFlags: TRACE_FLAG_SAMPLED,
        };
      },
    }));
    jest.spyOn(SentryCoreCurrentScopes, 'getCurrentScope').mockImplementation(() => mockedScope);
    jest.spyOn(SentryCoreCurrentScopes, 'getClient').mockImplementation(() => undefined);

    const traceData = getTraceData();

    expect(traceData).toEqual({});
  });

  it('returns an empty object if the `sentry-trace` value is invalid', () => {
    // @ts-expect-error - we don't need to provide all the properties
    jest.spyOn(SentryCoreSpanUtils, 'getActiveSpan').mockImplementation(() => ({
      isRecording: () => true,
      spanContext: () => {
        return {
          traceId: '1234567890123456789012345678901+',
          spanId: '1234567890123456',
          traceFlags: TRACE_FLAG_SAMPLED,
        };
      },
    }));

    const traceData = getTraceData();

    expect(traceData).toEqual({});
  });

  it('returns an empty object if the SDK is disabled', () => {
    jest.spyOn(SentryCoreExports, 'isEnabled').mockReturnValueOnce(false);

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
