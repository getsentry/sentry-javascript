import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis';
import { RedisInstrumentation as LegacyRedisInstrumentation } from '@opentelemetry/instrumentation-redis';
import { RedisInstrumentation } from '@opentelemetry/instrumentation-redis-4';
import { defineIntegration } from '@sentry/core';
import { addOpenTelemetryInstrumentation } from '@sentry/opentelemetry';
import type { IntegrationFn } from '@sentry/types';

interface RedisOptions {
  client?: 'ioredis' | 'redis-v2' | 'redis-v3' | 'redis-v4';
}

const _redisIntegration = ((options: RedisOptions = { client: 'redis-v4' }) => {

  return {
    name: 'Redis',
    setupOnce() {
      switch (options.client) {
        case 'ioredis':
          addOpenTelemetryInstrumentation(new IORedisInstrumentation({}));
          break;
        case 'redis-v2':
        case 'redis-v3':
          addOpenTelemetryInstrumentation(new LegacyRedisInstrumentation({}));
          break;
        case 'redis-v4':
          addOpenTelemetryInstrumentation(new RedisInstrumentation({}));
          break;
        default:
          // No need to do anything, as the default is already 'redis-v4'
          break;
      }
    },
  };
}) satisfies IntegrationFn;

/**
 * Redis integration
 *
 * Capture tracing data for redis and ioredis.
 */
export const experimental_redisIntegration = defineIntegration(_redisIntegration);
