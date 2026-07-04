import { defineIntegration, type IntegrationFn, waitForTracingChannelBinding } from '@sentry/core';
import * as dc from 'node:diagnostics_channel';
import { type RedisDiagnosticChannelResponseHook, subscribeRedisDiagnosticChannels } from './redis-dc-subscriber';

/** Options controlling the redis diagnostics-channel subscription. */
export interface RedisDiagnosticChannelsOptions {
  /**
   * Optional hook invoked once the redis command response arrives. Useful for attaching
   * response-derived attributes (e.g. cache hit/miss, payload size).
   */
  responseHook?: RedisDiagnosticChannelResponseHook;
}

const _redisIntegration = ((options: RedisDiagnosticChannelsOptions = {}) => {
  return {
    name: 'Redis',
    setupOnce() {
      // Bail on runtimes without `tracingChannel` (Node <= 18.18.0).
      if (!dc.tracingChannel) {
        return;
      }

      waitForTracingChannelBinding(() => {
        subscribeRedisDiagnosticChannels(dc.tracingChannel, options.responseHook);
      });
    },
  };
}) satisfies IntegrationFn;

/**
 * Auto-instrument the [redis](https://www.npmjs.com/package/redis) and
 * [ioredis](https://www.npmjs.com/package/ioredis) libraries via their native
 * `node:diagnostics_channel` tracing channels (node-redis >= 5.12.0, ioredis >= 5.11.0).
 */
export const redisIntegration = defineIntegration(_redisIntegration);
