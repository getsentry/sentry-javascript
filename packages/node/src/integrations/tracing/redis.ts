import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis';
// import { RedisInstrumentation as LegacyRedisInstrumentation } from '@opentelemetry/instrumentation-redis';
// import { RedisInstrumentation } from '@opentelemetry/instrumentation-redis-4';
import { defineIntegration } from '@sentry/core';
import { addOpenTelemetryInstrumentation } from '@sentry/opentelemetry';
import type { IntegrationFn } from '@sentry/types';

const _redisIntegration = (() => {
  return {
    name: 'Redis',
    setupOnce() {
      addOpenTelemetryInstrumentation([
        new IORedisInstrumentation({}),
        // todo: implement them gradually
        // new LegacyRedisInstrumentation({}),
        // new RedisInstrumentation({}),
      ]);
    },
  };
}) satisfies IntegrationFn;

/**
 * Redis integration
 *
 * Capture tracing data for redis and ioredis.
 */
export const experimental_redisIntegration = defineIntegration(_redisIntegration);
