import type { RedisDiagnosticChannelResponseHook } from '@sentry/server-utils';
import { redisIntegration as redisChannelIntegration } from '@sentry/server-utils';
import type { Integration, IntegrationFn } from '@sentry/core';
import { defineIntegration, extendIntegration } from '@sentry/core';

const INTEGRATION_NAME = 'DenoRedis' as const;

export interface DenoRedisIntegrationOptions {
  /**
   * Optional hook invoked once the redis command response arrives. Useful for
   * attaching response-derived attributes (e.g. cache hit/miss, payload size).
   */
  responseHook?: RedisDiagnosticChannelResponseHook;
}

const _denoRedisIntegration = ((options: DenoRedisIntegrationOptions = {}) => {
  // The diagnostics_channel subscription lives in server-utils so it is shared
  // across runtimes. The AsyncLocalStorage async-context strategy the channel
  // binding depends on is installed once in `init()`, so this wrapper only
  // renames the shared integration.
  return extendIntegration(redisChannelIntegration({ responseHook: options.responseHook }), {
    name: INTEGRATION_NAME,
  });
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
