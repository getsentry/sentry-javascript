import type { IntegrationFn } from '@sentry/core';
import { defineIntegration, extendIntegration } from '@sentry/core';
import {
  ioredisChannelIntegration,
  redisIntegration as redisChannelIntegration,
} from '@sentry/server-utils/orchestrion';

const INTEGRATION_NAME = 'Redis' as const;

export interface RedisOptions {
  /**
   * Define cache prefixes for cache keys that should be captured as a cache span.
   *
   * Setting this to, for example, `['user:']` will capture cache keys that start with `user:`.
   */
  cachePrefixes?: string[];
  /**
   * Maximum length of the cache key added to the span description. If the key exceeds this length, it will be truncated.
   *
   * Passing `0` will use the full cache key without truncation.
   *
   * By default, the full cache key is used.
   */
  maxCacheKeyLength?: number;
}

const _redisIntegration = ((options: RedisOptions = {}) => {
  // A single public `Redis` integration covers every redis client version. The native
  // diagnostics_channel subscription (node-redis >= 5.12.0, ioredis >= 5.11.0, and batches) lives in
  // server-utils so it is shared across server runtimes; the orchestrion channel integrations cover
  // the older node-redis (`<5.12.0`) and ioredis (`<5.11.0`) ranges. We fold the orchestrion
  // subscribers into this integration's `setup` so `Sentry.redisIntegration()` alone instruments all
  // ranges, even with `defaultIntegrations: []`. The cache instrumentation (driven by the options
  // below) lives in server-utils too, so both subscribers apply it from the same code.
  const ioredis = ioredisChannelIntegration(options);
  const redis = redisChannelIntegration(options);

  return extendIntegration(extendIntegration(ioredis, { ...redis }), { name: INTEGRATION_NAME });
}) satisfies IntegrationFn;

/**
 * Adds Sentry tracing instrumentation for the [redis](https://www.npmjs.com/package/redis) and
 * [ioredis](https://www.npmjs.com/package/ioredis) libraries.
 *
 * For more information, see the [`redisIntegration` documentation](https://docs.sentry.io/platforms/javascript/guides/node/configuration/integrations/redis/).
 *
 * @example
 * ```javascript
 * const Sentry = require('@sentry/node');
 *
 * Sentry.init({
 *  integrations: [Sentry.redisIntegration()],
 * });
 * ```
 */
export const redisIntegration = defineIntegration(_redisIntegration);
