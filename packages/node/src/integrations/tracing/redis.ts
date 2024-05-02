import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis';
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
 * Redis integration for "ioredis"
 *
 * Capture tracing data for redis and ioredis.
 */
export const redisIntegration = defineIntegration(_redisIntegration);
