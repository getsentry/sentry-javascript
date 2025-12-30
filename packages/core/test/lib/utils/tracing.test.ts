import { describe, expect, it, test } from 'vitest';
import {
  extractTraceparentData,
  generateTraceparentHeader,
  propagationContextFromHeaders,
  shouldContinueTrace,
} from '../../../src/utils/tracing';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';

const EXAMPLE_SENTRY_TRACE = '12312012123120121231201212312012-1121201211212012-1';
const EXAMPLE_BAGGAGE = 'sentry-release=1.2.3,sentry-foo=bar,other=baz,sentry-sample_rand=0.42';

describe('propagationContextFromHeaders()', () => {
  it('returns a completely new propagation context when no sentry-trace data is given but baggage data is given', () => {
    const result = propagationContextFromHeaders(undefined, undefined);
    expect(result).toEqual({
      traceId: expect.any(String),
      sampleRand: expect.any(Number),
    });
  });

  it('returns a completely new propagation context when no sentry-trace data is given', () => {
    const result = propagationContextFromHeaders(undefined, EXAMPLE_BAGGAGE);
    expect(result).toStrictEqual({
      traceId: expect.any(String),
      sampleRand: expect.any(Number),
    });
  });

  it('returns the correct traceparent data within the propagation context when sentry trace data is given', () => {
    const result = propagationContextFromHeaders(EXAMPLE_SENTRY_TRACE, undefined);
    expect(result).toStrictEqual(
      expect.objectContaining({
        traceId: '12312012123120121231201212312012',
        parentSpanId: '1121201211212012',
        sampled: true,
        sampleRand: expect.any(Number),
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
      sampled: true,
      sampleRand: 0.42,
      dsc: {
        release: '1.2.3',
        foo: 'bar',
        sample_rand: '0.42',
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
    const data = extractTraceparentData('0')!;

    expect(data).toBeDefined();
    expect(data.traceId).toBeUndefined();
    expect(data.parentSampled).toBeFalsy();
  });

  test('just sample decision - true', () => {
    const data = extractTraceparentData('1')!;

    expect(data).toBeDefined();
    expect(data.traceId).toBeUndefined();
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

describe('shouldContinueTrace', () => {
  test('returns true when both baggage and SDK org IDs are undefined', () => {
    const client = new TestClient(getDefaultTestClientOptions({}));

    const result = shouldContinueTrace(client, undefined);
    expect(result).toBe(true);
  });

  test('returns true when org IDs match', () => {
    const orgId = '123456';
    const client = new TestClient(getDefaultTestClientOptions({ orgId }));

    const result = shouldContinueTrace(client, orgId);
    expect(result).toBe(true);
  });

  test('returns false when org IDs do not match', () => {
    const client = new TestClient(getDefaultTestClientOptions({ orgId: '123456' }));

    const result = shouldContinueTrace(client, '654321');
    expect(result).toBe(false);
  });

  test('returns true when baggage org ID is undefined and strictTraceContinuation is false', () => {
    const client = new TestClient(getDefaultTestClientOptions({ orgId: '123456', strictTraceContinuation: false }));

    const result = shouldContinueTrace(client, undefined);
    expect(result).toBe(true);
  });

  test('returns true when SDK org ID is undefined and strictTraceContinuation is false', () => {
    const client = new TestClient(getDefaultTestClientOptions({ strictTraceContinuation: false }));

    const result = shouldContinueTrace(client, '123456');
    expect(result).toBe(true);
  });

  test('returns false when baggage org ID is undefined and strictTraceContinuation is true', () => {
    const client = new TestClient(getDefaultTestClientOptions({ orgId: '123456', strictTraceContinuation: true }));

    const result = shouldContinueTrace(client, undefined);
    expect(result).toBe(false);
  });

  test('returns false when SDK org ID is undefined and strictTraceContinuation is true', () => {
    const client = new TestClient(getDefaultTestClientOptions({ strictTraceContinuation: true }));

    const result = shouldContinueTrace(client, '123456');
    expect(result).toBe(false);
  });
});

describe('generateTraceparentHeader', () => {
  test('returns a traceparent header with the given ids and positive sampling decision', () => {
    const traceparent = generateTraceparentHeader('12345678901234567890123456789012', '1234567890123456', true);
    expect(traceparent).toBe('00-12345678901234567890123456789012-1234567890123456-01');
  });

  test('returns a traceparent header with the given ids and negative sampling decision', () => {
    const traceparent = generateTraceparentHeader('12345678901234567890123456789012', '1234567890123456', false);
    expect(traceparent).toBe('00-12345678901234567890123456789012-1234567890123456-00');
  });

  test('no sampling decision passed, creates a negatively sampled traceparent header', () => {
    const traceparent = generateTraceparentHeader('12345678901234567890123456789012', '1234567890123456');
    expect(traceparent).toBe('00-12345678901234567890123456789012-1234567890123456-00');
  });
});
