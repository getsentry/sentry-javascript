import type { Integration, IntegrationFn } from '@sentry/core';
import { defineIntegration, extendIntegration } from '@sentry/core';
import { redisIntegration as redisNativeChannelIntegration } from '@sentry/server-utils';
import { ioredisChannelIntegration, redisChannelIntegration } from '@sentry/server-utils/orchestrion';
import { cacheResponseHook, type RedisOptions, setRedisOptions } from './cache';

// `cacheResponseHook`/`_redisOptions` live in `./cache` (which has no OTel
// instrumentation imports) so the orchestrion opt-in can pull the hook without
// dragging the OTel redis instrumentation in. Re-exported here for tests.
export { _redisOptions, cacheResponseHook } from './cache';

const INTEGRATION_NAME = 'Redis' as const;

const _redisIntegration = ((options: RedisOptions = {}) => {
  // The native diagnostics_channel subscription (node-redis >= 5.12.0, ioredis >= 5.11.0, and
  // batches) lives in server-utils so it is shared across server runtimes; we extend it here to set
  // the node cache options. The orchestrion channel integrations for the older ranges are appended
  // separately (see `redisChannelIntegrations`). `cacheResponseHook` reads options set in the
  // extension's `setupOnce` below, but it only runs at command time, by which point those options are set.
  return extendIntegration(redisNativeChannelIntegration({ responseHook: cacheResponseHook }), {
    name: INTEGRATION_NAME,
    setupOnce() {
      setRedisOptions(options);
    },
  });
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

/**
 * The full set of default redis integrations: the `Redis` integration (native diagnostics_channel
 * for node-redis >= 5.12.0 / ioredis >= 5.11.0, and batches) plus the orchestrion channel
 * subscribers that cover the older node-redis (`<5.12.0`) and ioredis (`<5.11.0`) ranges. All three
 * share the node cache `responseHook`. Spread into `getAutoPerformanceIntegrations()`.
 */
export function redisChannelIntegrations(options: RedisOptions = {}): Integration[] {
  return [
    redisIntegration(options),
    ioredisChannelIntegration({ responseHook: cacheResponseHook }),
    redisChannelIntegration({ responseHook: cacheResponseHook }),
  ];
}
