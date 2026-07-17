import type { RateLimit, RateLimitOptions, RateLimitOutcome } from '@cloudflare/workers-types';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, startSpan } from '@sentry/core';

const ORIGIN = 'auto.faas.cloudflare.rate_limit';

/**
 * Wraps a Cloudflare rate limiter binding to create a span on each `limit()` call.
 */
export function instrumentRateLimit<T extends RateLimit>(rateLimit: T, bindingName: string): T {
  return new Proxy(rateLimit, {
    get(target, prop, receiver) {
      if (prop !== 'limit') {
        return Reflect.get(target, prop, receiver);
      }

      const original = Reflect.get(target, prop, receiver) as RateLimit['limit'];

      return function (this: unknown, options: RateLimitOptions): Promise<RateLimitOutcome> {
        return startSpan(
          {
            name: `rate_limit ${bindingName}`,
            attributes: {
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
            },
          },
          () => Reflect.apply(original, target, [options]),
        );
      };
    },
  });
}
