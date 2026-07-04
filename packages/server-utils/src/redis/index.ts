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
      // Bail on runtimes without `tracingChannel` (Node <= 18.18.0, Deno < 1.44.3).
      if (!dc.tracingChannel) {
        return;
      }

      // Subscribe to node-redis (>= 5.12.0) and ioredis (>= 5.11.0) native tracing channels.
      // This is a no-op on versions that don't publish to the channels, so it is always safe to call.
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
 *
 * On older client versions the channels are never published to, so this integration is inert and
 * the vendored OTel instrumentation handles instrumentation instead.
 */
export const redisIntegration = defineIntegration(_redisIntegration);
