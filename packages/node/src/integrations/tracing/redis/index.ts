import type { IntegrationFn } from '@sentry/core';
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
  // A single public `Redis` integration covers every redis client version. The native
  // diagnostics_channel subscription (node-redis >= 5.12.0, ioredis >= 5.11.0, and batches) lives in
  // server-utils so it is shared across server runtimes; the orchestrion channel integrations cover
  // the older node-redis (`<5.12.0`) and ioredis (`<5.11.0`) ranges. We fold the orchestrion
  // subscribers into this integration's `setup` so `Sentry.redisIntegration()` alone instruments
  // all ranges, even with `defaultIntegrations: []`. All three share the node cache `responseHook`,
  // which reads the options set below but only runs at command time, by which point they are set.
  const orchestrionIntegrations = [
    ioredisChannelIntegration({ responseHook: cacheResponseHook }),
    redisChannelIntegration({ responseHook: cacheResponseHook }),
  ];

  return extendIntegration(redisNativeChannelIntegration({ responseHook: cacheResponseHook }), {
    name: INTEGRATION_NAME,
    setupOnce() {
      setRedisOptions(options);
    },
    setup(client) {
      for (const integration of orchestrionIntegrations) {
        integration.setup?.(client);
      }
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
