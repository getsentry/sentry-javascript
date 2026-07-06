// * import so that loading this module doesn't error on Deno versions
// lacking `tracingChannel` (added in Deno 1.44.3).
// On older runtimes the integration becomes a no-op.
import * as dc from 'node:diagnostics_channel';
import type { RedisDiagnosticChannelResponseHook, RedisTracingChannelFactory } from '@sentry/server-utils';
import { subscribeRedisDiagnosticChannels } from '@sentry/server-utils';
import type { Integration, IntegrationFn } from '@sentry/core';
import { defineIntegration } from '@sentry/core';
import { setAsyncLocalStorageAsyncContextStrategy } from '../async';

const INTEGRATION_NAME = 'DenoRedis' as const;

export interface DenoRedisIntegrationOptions {
  /**
   * Optional hook invoked once the redis command response arrives. Useful for
   * attaching response-derived attributes (e.g. cache hit/miss, payload size).
   */
  responseHook?: RedisDiagnosticChannelResponseHook;
}

const _denoRedisIntegration = ((options: DenoRedisIntegrationOptions = {}) => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      if (!dc.tracingChannel) {
        return;
      }
      // The span is bound into Deno's AsyncLocalStorage context via the async-context
      // strategy's `getTracingChannelBinding`, so the native channel can be passed directly.
      setAsyncLocalStorageAsyncContextStrategy();
      subscribeRedisDiagnosticChannels(dc.tracingChannel as RedisTracingChannelFactory, options.responseHook);
    },
  };
}) satisfies IntegrationFn;

/**
 * Creates spans for redis commands, batches, and connects under Deno via
 * `node:diagnostics_channel`. Subscribes to both node-redis (>= 5.12.0) and
 * ioredis (>= 5.11.0) channels — both libraries publish to dedicated channels
 * once they're new enough; on older releases the subscribers are inert.
 */
export const denoRedisIntegration = defineIntegration(_denoRedisIntegration) as (
  options?: DenoRedisIntegrationOptions,
) => Integration & { name: 'DenoRedis'; setupOnce: () => void };
