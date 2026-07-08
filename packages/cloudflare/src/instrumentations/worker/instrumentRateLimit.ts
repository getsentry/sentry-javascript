import type { RateLimit, RateLimitOptions, RateLimitOutcome } from '@cloudflare/workers-types';
import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, startSpan } from '@sentry/core';

const ORIGIN = 'auto.faas.cloudflare.rate_limit';
const OP = 'ratelimit';

/**
 * Wraps a Cloudflare rate limiter binding to create a span on each `limit()` call.
 *
 * A `success: false` outcome means the request was rate limited. That is an
 * expected result rather than an error, so it is recorded as a span attribute
 * instead of setting an error status on the span. The rate limit `key` is
 * intentionally not recorded because it frequently carries user-identifying
 * data (e.g. an IP address or user id).
 */
export function instrumentRateLimit<T extends RateLimit>(rateLimit: T, bindingName: string): T {
  return new Proxy(rateLimit, {
    get(target, prop, receiver) {
      if (prop === 'limit') {
        const original = Reflect.get(target, prop, receiver) as RateLimit['limit'];

        return function (this: unknown, options: RateLimitOptions): Promise<RateLimitOutcome> {
          return startSpan(
            {
              op: OP,
              name: `rate_limit ${bindingName}`,
              attributes: {
                'cloudflare.rate_limit.binding': bindingName,
                [SEMANTIC_ATTRIBUTE_SENTRY_OP]: OP,
                [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
              },
            },
            async span => {
              const outcome = await Reflect.apply(original, target, [options]);
              span.setAttribute('cloudflare.rate_limit.success', outcome.success);
              return outcome;
            },
          );
        };
      }

      return Reflect.get(target, prop, receiver);
    },
  });
}
