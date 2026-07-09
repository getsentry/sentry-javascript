import type { IntegrationFn } from '@sentry/core';
import { defineIntegration, extendIntegration } from '@sentry/core';
import * as dc from 'node:diagnostics_channel';
import { redisIntegration as redisChannelIntegration } from '@sentry/server-utils';
import { generateInstrumentOnce } from '@sentry/node-core';
import { isDiagnosticsChannelInjectionEnabled } from '../../../sdk/diagnosticsChannelInjection';
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
    // When diagnostics-channel injection is opted in, orchestrion fully owns the older
    // ioredis (`<5.11.0`) and redis/node-redis (`<5.12.0`) ranges — commands, connect, and
    // batches — so skip both OTel monkey-patches to avoid double instrumentation. On Node
    // without `tracingChannel` (<18.19) orchestrion can't run, so keep the OTel patches there.
    if (!isDiagnosticsChannelInjectionEnabled() || !dc.tracingChannel) {
      instrumentIORedis();
      instrumentRedisModule();
    }

    // todo: implement them gradually
    // new LegacyRedisInstrumentation({}),
  },
  { id: INTEGRATION_NAME },
);

const _redisIntegration = ((options: RedisOptions = {}) => {
  // The diagnostics_channel subscription (node-redis >= 5.12.0, ioredis >= 5.11.0) lives in
  // server-utils so it is shared across server runtimes; we extend it here to also run the vendored
  // OTel patchers for older client versions. `cacheResponseHook` reads options set in the extension's
  // `setupOnce` below, but it only runs at command time, by which point those options are set.
  return extendIntegration(redisChannelIntegration({ responseHook: cacheResponseHook }), {
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
