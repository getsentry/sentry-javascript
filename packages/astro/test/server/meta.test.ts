import * as SentryCore from '@sentry/core';
import { vi } from 'vitest';

import { getTracingMetaTags } from '../../src/server/meta';

const mockedSpan = {
  toTraceparent: () => '123',
  transaction: {
    getDynamicSamplingContext: () => ({
      environment: 'production',
    }),
  },
};

const mockedHub = {
  getScope: () => ({
    getPropagationContext: () => ({
      traceId: '123',
    }),
  }),
  getClient: () => ({}),
};

describe('getTracingMetaTags', () => {
  it('returns the tracing tags from the span, if it is provided', () => {
    {
      // @ts-expect-error - only passing a partial span object
      const tags = getTracingMetaTags(mockedSpan, mockedHub);

      expect(tags).toEqual({
        sentryTrace: '<meta name="sentry-trace" content="123"/>',
        baggage: '<meta name="baggage" content="sentry-environment=production"/>',
      });
    }
  });

  it('returns propagationContext DSC data if no span is available', () => {
    const tags = getTracingMetaTags(undefined, {
      ...mockedHub,
      // @ts-expect-error - only passing a partial scope object
      getScope: () => ({
        getPropagationContext: () => ({
          traceId: 'abc',
          sampled: true,
          spanId: '456',
          dsc: {
            environment: 'staging',
            public_key: 'key',
            trace_id: 'abc',
          },
        }),
      }),
    });

    expect(tags).toEqual({
      sentryTrace: expect.stringMatching(/<meta name="sentry-trace" content="abc-.+-1"/),
      baggage: '<meta name="baggage" content="sentry-environment=staging,sentry-public_key=key,sentry-trace_id=abc"/>',
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
        toTraceparent: () => '123',
        transaction: undefined,
      },
      mockedHub,
    );

    expect(tags).toEqual({
      sentryTrace: '<meta name="sentry-trace" content="123"/>',
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
        toTraceparent: () => '123',
        transaction: undefined,
      },
      {
        ...mockedHub,
        getClient: () => undefined,
      },
    );

    expect(tags).toEqual({
      sentryTrace: '<meta name="sentry-trace" content="123"/>',
    });
  });
});
