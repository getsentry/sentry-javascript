import type { RateLimit } from '@cloudflare/workers-types';
import * as SentryCore from '@sentry/core';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { instrumentRateLimit } from '../../../src/instrumentations/worker/instrumentRateLimit';

function createMockRateLimit(success = true): RateLimit {
  return {
    limit: vi.fn().mockResolvedValue({ success }),
  } as unknown as RateLimit;
}

describe('instrumentRateLimit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const startSpanSpy = vi.spyOn(SentryCore, 'startSpan');

  describe('limit', () => {
    test('forwards the call and returns the outcome', async () => {
      const rateLimit = createMockRateLimit(true);
      const wrapped = instrumentRateLimit(rateLimit, 'MY_RATE_LIMITER');

      const outcome = await wrapped.limit({ key: 'user-123' });

      expect(outcome).toEqual({ success: true });
      expect(rateLimit.limit).toHaveBeenCalledTimes(1);
      expect(rateLimit.limit).toHaveBeenCalledWith({ key: 'user-123' });
    });

    test('returns an unsuccessful (rate-limited) outcome unchanged', async () => {
      const wrapped = instrumentRateLimit(createMockRateLimit(false), 'MY_RATE_LIMITER');

      const outcome = await wrapped.limit({ key: 'user-123' });

      expect(outcome).toEqual({ success: false });
    });

    test('starts a span with correct attributes', async () => {
      const wrapped = instrumentRateLimit(createMockRateLimit(true), 'MY_RATE_LIMITER');
      await wrapped.limit({ key: 'user-123' });

      expect(startSpanSpy).toHaveBeenCalledTimes(1);
      expect(startSpanSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          op: 'ratelimit',
          name: 'rate_limit MY_RATE_LIMITER',
          attributes: expect.objectContaining({
            'cloudflare.rate_limit.binding': 'MY_RATE_LIMITER',
            'sentry.op': 'ratelimit',
            'sentry.origin': 'auto.faas.cloudflare.rate_limit',
          }),
        }),
        expect.any(Function),
      );
    });

    test('does not record the rate limit key (avoids leaking PII)', async () => {
      const wrapped = instrumentRateLimit(createMockRateLimit(true), 'MY_RATE_LIMITER');
      await wrapped.limit({ key: 'super-secret-user-id' });

      const attributes = startSpanSpy.mock.calls[0]![0].attributes!;
      expect(JSON.stringify(attributes)).not.toContain('super-secret-user-id');
    });

    test('records the outcome success on the span', async () => {
      const setAttribute = vi.fn();
      startSpanSpy.mockImplementationOnce(((_options: unknown, callback: (span: unknown) => unknown) =>
        callback({ setAttribute })) as unknown as typeof SentryCore.startSpan);

      const wrapped = instrumentRateLimit(createMockRateLimit(false), 'MY_RATE_LIMITER');
      await wrapped.limit({ key: 'user-123' });

      expect(setAttribute).toHaveBeenCalledWith('cloudflare.rate_limit.success', false);
    });
  });

  test('forwards unknown property accesses transparently', () => {
    const rateLimit = Object.assign(createMockRateLimit(), {
      customMethod: vi.fn().mockReturnValue('hi'),
    }) as unknown as RateLimit & { customMethod: () => string };
    const wrapped = instrumentRateLimit(rateLimit, 'MY_RATE_LIMITER') as RateLimit & { customMethod: () => string };

    expect(wrapped.customMethod()).toBe('hi');
  });
});
