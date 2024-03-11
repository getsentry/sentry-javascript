import * as SentryCore from '@sentry/core';
import { SentrySpan } from '@sentry/core';
import type { Transaction } from '@sentry/types';
import { vi } from 'vitest';

import { getTracingMetaTags, isValidBaggageString } from '../../src/server/meta';

const TRACE_FLAG_SAMPLED = 1;

const mockedSpan = new SentrySpan({
  traceId: '12345678901234567890123456789012',
  spanId: '1234567890123456',
  sampled: true,
});
// eslint-disable-next-line deprecation/deprecation
mockedSpan.transaction = {
  getDynamicSamplingContext: () => ({
    environment: 'production',
  }),
} as Transaction;

const mockedClient = {} as any;

const mockedScope = {
  getPropagationContext: () => ({
    traceId: '123',
  }),
} as any;

describe('getTracingMetaTags', () => {
  it('returns the tracing tags from the span, if it is provided', () => {
    {
      vi.spyOn(SentryCore, 'getDynamicSamplingContextFromSpan').mockReturnValueOnce({
        environment: 'production',
      });

      const tags = getTracingMetaTags(mockedSpan, mockedScope, mockedClient);

      expect(tags).toEqual({
        sentryTrace: '<meta name="sentry-trace" content="12345678901234567890123456789012-1234567890123456-1"/>',
        baggage: '<meta name="baggage" content="sentry-environment=production"/>',
      });
    }
  });

  it('returns propagationContext DSC data if no span is available', () => {
    const tags = getTracingMetaTags(
      undefined,
      {
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
      } as any,
      mockedClient,
    );

    expect(tags).toEqual({
      sentryTrace: expect.stringMatching(
        /<meta name="sentry-trace" content="12345678901234567890123456789012-(.{16})-1"\/>/,
      ),
      baggage:
        '<meta name="baggage" content="sentry-environment=staging,sentry-public_key=key,sentry-trace_id=12345678901234567890123456789012"/>',
    });
  });

  it('returns only the `sentry-trace` tag if no DSC is available', () => {
    vi.spyOn(SentryCore, 'getDynamicSamplingContextFromClient').mockReturnValueOnce({
      trace_id: '',
      public_key: undefined,
    });

    const tags = getTracingMetaTags(
      // @ts-expect-error - only passing a partial span object
      {
        isRecording: () => true,
        spanContext: () => {
          return {
            traceId: '12345678901234567890123456789012',
            spanId: '1234567890123456',
            traceFlags: TRACE_FLAG_SAMPLED,
          };
        },
        transaction: undefined,
      },
      mockedScope,
      mockedClient,
    );

    expect(tags).toEqual({
      sentryTrace: '<meta name="sentry-trace" content="12345678901234567890123456789012-1234567890123456-1"/>',
    });
  });

  it('returns only the `sentry-trace` tag if no DSC is available without a client', () => {
    vi.spyOn(SentryCore, 'getDynamicSamplingContextFromClient').mockReturnValueOnce({
      trace_id: '',
      public_key: undefined,
    });

    const tags = getTracingMetaTags(
      // @ts-expect-error - only passing a partial span object
      {
        isRecording: () => true,
        spanContext: () => {
          return {
            traceId: '12345678901234567890123456789012',
            spanId: '1234567890123456',
            traceFlags: TRACE_FLAG_SAMPLED,
          };
        },
        transaction: undefined,
      },
      mockedScope,
      undefined,
    );

    expect(tags).toEqual({
      sentryTrace: '<meta name="sentry-trace" content="12345678901234567890123456789012-1234567890123456-1"/>',
    });
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
