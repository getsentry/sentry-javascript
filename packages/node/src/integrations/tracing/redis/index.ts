import type { IntegrationFn } from '@sentry/core';
import { defineIntegration, waitForTracingChannelBinding } from '@sentry/core';
import * as dc from 'node:diagnostics_channel';
import { subscribeRedisDiagnosticChannels, type RedisTracingChannelFactory } from '@sentry/server-utils';
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
    // When diagnostics-channel injection is opted in, orchestrion owns ioredis
    // `<5.11.0`, so skip the OTel ioredis monkey-patch to avoid double instrumentation.
    // On Node without `tracingChannel` (<18.19) orchestrion can't run, so keep the
    // OTel patch there — otherwise ioredis `<5.11.0` would not be traced at all.
    if (!isDiagnosticsChannelInjectionEnabled() || !dc.tracingChannel) {
      instrumentIORedis();
    }
    instrumentRedisModule();
    // node-redis >= 5.12.0 and ioredis >= 5.11.0 publish via diagnostics_channel.
    // `bindTracingChannelToSpan` (inside the subscriber) makes the span the active
    // OTel context via `bindStore`, which needs the Sentry OTel context manager to
    // be registered — `initOpenTelemetry()` does that after integration `setupOnce`,
    // so defer to the next tick.
    // Check this here to ensure this does not fail at runtime for Node <= 18.18.0
    if (dc.tracingChannel) {
      waitForTracingChannelBinding(() => {
        subscribeRedisDiagnosticChannels(dc.tracingChannel as RedisTracingChannelFactory, cacheResponseHook);
      });
    }

    // todo: implement them gradually
    // new LegacyRedisInstrumentation({}),
  },
  { id: INTEGRATION_NAME },
);

const _redisIntegration = ((options: RedisOptions = {}) => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      setRedisOptions(options);
      instrumentRedis();
    },
  };
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
