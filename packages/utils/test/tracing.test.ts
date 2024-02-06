import { propagationContextFromHeaders, tracingContextFromHeaders } from '../src/tracing';

const EXAMPLE_SENTRY_TRACE = '12312012123120121231201212312012-1121201211212012-1';
const EXAMPLE_BAGGAGE = 'sentry-release=1.2.3,sentry-foo=bar,other=baz';

describe('tracingContextFromHeaders()', () => {
  it('should produce a frozen baggage (empty object) when there is an incoming trace but no baggage header', () => {
    // eslint-disable-next-line deprecation/deprecation
    const tracingContext = tracingContextFromHeaders('12312012123120121231201212312012-1121201211212012-1', undefined);
    expect(tracingContext.dynamicSamplingContext).toEqual({});
    expect(tracingContext.propagationContext.dsc).toEqual({});
  });
});

describe('propagationContextFromHeaders()', () => {
  it('returns a completely new propagation context when no sentry-trace data is given but baggage data is given', () => {
    const result = propagationContextFromHeaders(undefined, undefined);
    expect(result).toEqual({
      traceId: expect.any(String),
      spanId: expect.any(String),
    });
  });

  it('returns a completely new propagation context when no sentry-trace data is given', () => {
    const result = propagationContextFromHeaders(undefined, EXAMPLE_BAGGAGE);
    expect(result).toEqual({
      traceId: expect.any(String),
      spanId: expect.any(String),
    });
  });

  it('returns the correct traceparent data within the propagation context when sentry trace data is given', () => {
    const result = propagationContextFromHeaders(EXAMPLE_SENTRY_TRACE, undefined);
    expect(result).toEqual(
      expect.objectContaining({
        traceId: '12312012123120121231201212312012',
        parentSpanId: '1121201211212012',
        spanId: expect.any(String),
        sampled: true,
      }),
    );
  });

  it('returns a frozen dynamic sampling context (empty object) when there is an incoming trace but no baggage header', () => {
    const result = propagationContextFromHeaders(EXAMPLE_SENTRY_TRACE, undefined);
    expect(result).toEqual(
      expect.objectContaining({
        dsc: {},
      }),
    );
  });

  it('returns the correct trace parent data when both sentry-trace and baggage are given', () => {
    const result = propagationContextFromHeaders(EXAMPLE_SENTRY_TRACE, EXAMPLE_BAGGAGE);
    expect(result).toEqual({
      traceId: '12312012123120121231201212312012',
      parentSpanId: '1121201211212012',
      spanId: expect.any(String),
      sampled: true,
      dsc: {
        release: '1.2.3',
        foo: 'bar',
      },
    });
  });
});
