import type { Integration, IntegrationFn } from '@sentry/core';
import { defineIntegration, extendIntegration } from '@sentry/core';
import * as dc from 'node:diagnostics_channel';
import { redisIntegration as redisNativeChannelIntegration } from '@sentry/server-utils';
import { ioredisChannelIntegration, redisChannelIntegration } from '@sentry/server-utils/orchestrion';
import { generateInstrumentOnce } from '../../../otel/instrument';
import { cacheResponseHook, type RedisOptions, setRedisOptions } from './cache';
import { IORedisInstrumentation } from './vendored/ioredis-instrumentation';
import { RedisInstrumentation } from './vendored/redis-instrumentation';

// `cacheResponseHook`/`_redisOptions` live in `./cache` (which has no OTel
// instrumentation imports) so the orchestrion opt-in can pull the hook without
// dragging the OTel redis instrumentation in. Re-exported here for tests.
export { _redisOptions, cacheResponseHook } from './cache';

const INTEGRATION_NAME = 'Redis' as const;

const instrumentIORedis = generateInstrumentOnce(`${INTEGRATION_NAME}.IORedis`, () => {
  return new IORedisInstrumentation({
    responseHook: cacheResponseHook,
  });
});

const instrumentRedisModule = generateInstrumentOnce(`${INTEGRATION_NAME}.Redis`, () => {
  return new RedisInstrumentation({
    responseHook: cacheResponseHook,
  });
});

/**
 * To be able to preload all Redis OTel instrumentations with just one ID
 * ("Redis"), all the instrumentations are generated in this one function
 */
export const instrumentRedis = Object.assign(
  (): void => {
    // The orchestrion channel integrations (`IORedis`, `RedisChannel`, appended to the default set)
    // own the older ioredis (`<5.11.0`) and node-redis (`<5.12.0`) ranges — commands, connect, and
    // batches — so skip both OTel monkey-patches whenever orchestrion can run to avoid double
    // instrumentation. On Node without `tracingChannel` (<18.19) orchestrion can't run, so keep the
    // OTel patches there.
    if (!dc.tracingChannel) {
      instrumentIORedis();
      instrumentRedisModule();
    }

    // todo: implement them gradually
    // new LegacyRedisInstrumentation({}),
  },
  { id: INTEGRATION_NAME },
);

const _redisIntegration = ((options: RedisOptions = {}) => {
  // The native diagnostics_channel subscription (node-redis >= 5.12.0, ioredis >= 5.11.0, and
  // batches) lives in server-utils so it is shared across server runtimes; we extend it here to also
  // run the vendored OTel patchers for older client versions on runtimes without `tracingChannel`.
  // The orchestrion channel integrations for the older ranges are appended separately (see
  // `redisChannelIntegrations`). `cacheResponseHook` reads options set in the extension's `setupOnce`
  // below, but it only runs at command time, by which point those options are set.
  return extendIntegration(redisNativeChannelIntegration({ responseHook: cacheResponseHook }), {
    name: INTEGRATION_NAME,
    setupOnce() {
      setRedisOptions(options);
      instrumentRedis();
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
 * The full set of default redis integrations: the composite `Redis` integration (native
 * diagnostics_channel for node-redis >= 5.12.0 / ioredis >= 5.11.0, batches, and the vendored OTel
 * patchers for older ranges when `tracingChannel` is unavailable) plus the orchestrion channel
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
