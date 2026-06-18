// * import so that loading this module doesn't error on Deno versions
// lacking `tracingChannel` (added in Deno 1.44.3).
// On older runtimes the integration becomes a no-op.
import * as dc from 'node:diagnostics_channel';
import type {
  RedisDiagnosticChannelResponseHook,
  RedisTracingChannel,
  RedisTracingChannelFactory,
  RedisTracingChannelSubscribers,
} from '@sentry/server-utils';
import { subscribeRedisDiagnosticChannels } from '@sentry/server-utils';
import type { Integration, IntegrationFn, Span } from '@sentry/core';
import { defineIntegration } from '@sentry/core';
import { setAsyncLocalStorageAsyncContextStrategy } from '../async';

const INTEGRATION_NAME = 'DenoRedis';

export interface DenoRedisIntegrationOptions {
  /**
   * Optional hook invoked once the redis command response arrives. Useful for
   * attaching response-derived attributes (e.g. cache hit/miss, payload size).
   */
  responseHook?: RedisDiagnosticChannelResponseHook;
}

/**
 * Portable tracing-channel factory: wraps `node:diagnostics_channel.tracingChannel`
 * and stamps `data._sentrySpan` from `transformStart` in the `start` subscriber.
 *
 * Unlike `@sentry/opentelemetry/tracing-channel`, this does not call `bindStore`
 */
type DataWithSpan<T> = T & { _sentrySpan?: Span };
type SubscriberFn<T> = (data: DataWithSpan<T>) => void;

const portableTracingChannel: RedisTracingChannelFactory = <T extends object>(
  name: string,
  transformStart: (data: T) => Span,
): RedisTracingChannel<T> => {
  const channel = dc.tracingChannel<DataWithSpan<T>>(name);
  return {
    subscribe(subs: Partial<RedisTracingChannelSubscribers<T>>): void {
      const userStart = subs.start as SubscriberFn<T> | undefined;
      const composed: Record<string, SubscriberFn<T>> = {
        start(data) {
          data._sentrySpan = transformStart(data);
          userStart?.(data);
        },
      };
      for (const event of ['asyncStart', 'asyncEnd', 'end', 'error'] as const) {
        const fn = subs[event] as SubscriberFn<T> | undefined;
        if (fn) composed[event] = fn;
      }
      // Native subscribe is typed for the full subscriber set, but only the
      // handlers actually present are invoked at runtime.
      channel.subscribe(composed as unknown as Parameters<typeof channel.subscribe>[0]);
    },
  };
};

const _denoRedisIntegration = ((options: DenoRedisIntegrationOptions = {}) => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      if (!dc.tracingChannel) {
        return;
      }
      setAsyncLocalStorageAsyncContextStrategy();
      subscribeRedisDiagnosticChannels(portableTracingChannel, options.responseHook);
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
