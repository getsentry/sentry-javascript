import { extractTraceparentData, propagationContextFromHeaders } from '../src/tracing';

const EXAMPLE_SENTRY_TRACE = '12312012123120121231201212312012-1121201211212012-1';
const EXAMPLE_BAGGAGE = 'sentry-release=1.2.3,sentry-foo=bar,other=baz';

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

describe('extractTraceparentData', () => {
  test('no sample', () => {
    const data = extractTraceparentData('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb') as any;

    expect(data).toBeDefined();
    expect(data.parentSpanId).toEqual('bbbbbbbbbbbbbbbb');
    expect(data.traceId).toEqual('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(data?.parentSampled).toBeUndefined();
  });

  test('sample true', () => {
    const data = extractTraceparentData('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-1') as any;

    expect(data).toBeDefined();
    expect(data.parentSampled).toBeTruthy();
  });

  test('sample false', () => {
    const data = extractTraceparentData('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-0') as any;

    expect(data).toBeDefined();
    expect(data.parentSampled).toBeFalsy();
  });

  test('just sample decision - false', () => {
    const data = extractTraceparentData('0') as any;

    expect(data).toBeDefined();
    expect(data.traceId).toBeUndefined();
    expect(data.spanId).toBeUndefined();
    expect(data.parentSampled).toBeFalsy();
  });

  test('just sample decision - true', () => {
    const data = extractTraceparentData('1') as any;

    expect(data).toBeDefined();
    expect(data.traceId).toBeUndefined();
    expect(data.spanId).toBeUndefined();
    expect(data.parentSampled).toBeTruthy();
  });

  test('invalid', () => {
    // undefined
    expect(extractTraceparentData(undefined)).toBeUndefined();

    // empty string
    expect(extractTraceparentData('')).toBeUndefined();

    // trace id wrong length
    expect(extractTraceparentData('a-bbbbbbbbbbbbbbbb-1')).toBeUndefined();

    // parent span id wrong length
    expect(extractTraceparentData('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-b-1')).toBeUndefined();

    // parent sampling decision wrong length
    expect(extractTraceparentData('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-11')).toBeUndefined();

    // trace id invalid hex value
    expect(extractTraceparentData('someStuffHereWhichIsNotAtAllHexy-bbbbbbbbbbbbbbbb-1')).toBeUndefined();

    // parent span id invalid hex value
    expect(extractTraceparentData('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-alsoNotSuperHexy-1')).toBeUndefined();

    // bogus sampling decision
    expect(extractTraceparentData('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-x')).toBeUndefined();
  });
});
