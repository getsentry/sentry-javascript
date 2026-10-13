import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getCloudflareExecutionContext,
  getTracePropagationData,
  setCloudflareExecutionContextFallback,
} from '../../src/server-common/utils';

const MOCK_REQUEST_EVENT: any = {
  request: {
    headers: {
      get: (key: string) => {
        if (key === 'sentry-trace') {
          return '1234567890abcdef1234567890abcdef-1234567890abcdef-1';
        }

        if (key === 'baggage') {
          return (
            'sentry-environment=production,sentry-release=1.0.0,sentry-transaction=dogpark,' +
            'sentry-public_key=dogsarebadatkeepingsecrets,' +
            'sentry-trace_id=1234567890abcdef1234567890abcdef,sentry-sample_rate=1'
          );
        }

        return null;
      },
    },
  },
};

describe('getTracePropagationData', () => {
  it('returns sentryTrace & baggage strings if both are available', () => {
    const event: any = MOCK_REQUEST_EVENT;

    const { sentryTrace, baggage } = getTracePropagationData(event);

    expect(sentryTrace).toEqual('1234567890abcdef1234567890abcdef-1234567890abcdef-1');
    expect(baggage?.split(',').sort()).toEqual([
      'sentry-environment=production',
      'sentry-public_key=dogsarebadatkeepingsecrets',
      'sentry-release=1.0.0',
      'sentry-sample_rate=1',
      'sentry-trace_id=1234567890abcdef1234567890abcdef',
      'sentry-transaction=dogpark',
    ]);
  });

  it('returns empty if the necessary header is not available', () => {
    const event: any = { request: { headers: { get: () => undefined } } };
    const { sentryTrace, baggage } = getTracePropagationData(event);

    expect(sentryTrace).toBe('');
    expect(baggage).toBeUndefined();
  });
});

describe('getCloudflareExecutionContext', () => {
  afterEach(() => {
    setCloudflareExecutionContextFallback(undefined);
  });

  it.each([
    ['context', 'adapter-cloudflare <= 7'],
    ['ctx', 'adapter-cloudflare 8'],
  ])('reads platform.%s (%s)', platformKey => {
    const ctx = { waitUntil: vi.fn() };

    expect(getCloudflareExecutionContext({ [platformKey]: ctx })).toBe(ctx);
  });

  it('returns undefined without a platform and without a registered fallback', () => {
    expect(getCloudflareExecutionContext(undefined)).toBeUndefined();
    expect(getCloudflareExecutionContext({})).toBeUndefined();
  });

  // `adapter-cloudflare` >= 8.0.0-next.7 passes no `platform` object at all
  it('falls back to the registered provider when the platform carries no execution context', () => {
    const fallbackCtx = { waitUntil: vi.fn() };
    setCloudflareExecutionContextFallback(() => fallbackCtx);

    expect(getCloudflareExecutionContext(undefined)).toBe(fallbackCtx);
    expect(getCloudflareExecutionContext({})).toBe(fallbackCtx);
  });

  it('prefers the execution context on the platform over the fallback', () => {
    const ctx = { waitUntil: vi.fn() };
    setCloudflareExecutionContextFallback(() => ({ waitUntil: vi.fn() }));

    expect(getCloudflareExecutionContext({ ctx })).toBe(ctx);
  });
});
