import { DEBUG_BUILD } from '../../debug-build';
import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '../../semanticAttributes';
import { SPAN_STATUS_ERROR } from '../../tracing/spanstatus';
import { startSpanManual } from '../../tracing/trace';
import type { Span } from '../../types/span';
import { debug } from '../../utils/debug-logger';

// Channel names published by node-redis >= 5.12.0 and ioredis >= 5.11.0.
// Hardcoded so the subscriber does not have to import either library — the
// channels just have to be subscribed to before the user's redis code
// publishes.
export const REDIS_DC_CHANNEL_COMMAND = 'node-redis:command';
export const REDIS_DC_CHANNEL_BATCH = 'node-redis:batch';
export const REDIS_DC_CHANNEL_CONNECT = 'node-redis:connect';
export const IOREDIS_DC_CHANNEL_COMMAND = 'ioredis:command';
export const IOREDIS_DC_CHANNEL_CONNECT = 'ioredis:connect';

const ORIGIN = 'auto.db.redis.diagnostic_channel';

// Inlined semconv attribute keys — these are plain strings, no need to depend
// on @opentelemetry/semantic-conventions for them.
const ATTR_DB_STATEMENT = 'db.statement';
const ATTR_DB_SYSTEM = 'db.system';
const ATTR_NET_PEER_NAME = 'net.peer.name';
const ATTR_NET_PEER_PORT = 'net.peer.port';
const DB_SYSTEM_VALUE_REDIS = 'redis';

const NOOP = (): void => {};

/**
 * Shape of the `node-redis:command` channel payload published by node-redis.
 *
 * Both `command` and `args` are already redacted by node-redis itself (see
 * `sanitizeArgs` in @redis/client) using the OTel `redis-common` rules. The
 * arg array is `[<command>, <safe arg>, ..., '?', ...]` — `?` replaces any
 * value the library considers sensitive. Subscribers can emit `args` directly
 * as `db.statement` without further serialization.
 */
export interface RedisCommandData {
  command: string;
  /** First arg is the command name itself; consumers should slice it off. */
  args: string[];
  database?: number;
  serverAddress?: string;
  serverPort?: number;
  result?: unknown;
  error?: Error;
}

/**
 * Shape of the `ioredis:command` channel payload published by ioredis >= 5.11.0.
 *
 * As with node-redis, args are already sanitized by ioredis (`sanitizeArgs` in
 * `lib/tracing.ts`) before publishing. Unlike node-redis, the command name is
 * NOT prepended to `args`.
 */
export interface IORedisCommandData {
  command: string;
  args: string[];
  batchMode?: 'MULTI';
  batchSize?: number;
  database?: number;
  serverAddress?: string;
  serverPort?: number;
  result?: unknown;
  error?: Error;
}

/** Shape of the `node-redis:batch` channel payload published by node-redis. */
export interface RedisBatchData {
  batchMode?: 'MULTI' | 'PIPELINE';
  batchSize?: number;
  database?: number;
  clientId?: string | number;
  serverAddress?: string;
  serverPort?: number;
  result?: unknown[];
  error?: Error;
}

/** Shape of the `*:connect` channel payload published by node-redis and ioredis. */
export interface RedisConnectData {
  serverAddress?: string;
  serverPort?: number;
  url?: string;
  error?: Error;
}

/**
 * Optional callback invoked once the redis command response arrives. Useful
 * for attaching response-derived attributes (e.g. cache hit/miss, payload size).
 *
 * Mirrors `@opentelemetry/instrumentation-ioredis`' response hook so existing
 * Sentry node code (`cacheResponseHook`) can be reused unchanged.
 */
export type RedisDiagnosticChannelResponseHook = (
  span: Span,
  cmdName: string,
  cmdArgs: string[],
  result: unknown,
) => void;

/**
 * Payload type observed by tracing-channel subscribers — the channel payload
 * with `_sentrySpan` stamped on it by the start handler so async/error
 * handlers downstream can read it back.
 */
export type RedisTracingChannelContextWithSpan<T> = T & { _sentrySpan?: Span };

/** Subscriber object accepted by {@link RedisTracingChannel.subscribe}. */
export interface RedisTracingChannelSubscribers<T> {
  start: (data: RedisTracingChannelContextWithSpan<T>) => void;
  asyncStart: (data: RedisTracingChannelContextWithSpan<T>) => void;
  asyncEnd: (data: RedisTracingChannelContextWithSpan<T>) => void;
  end: (data: RedisTracingChannelContextWithSpan<T>) => void;
  error: (data: RedisTracingChannelContextWithSpan<T>) => void;
}

/** Minimal tracing-channel surface the subscriber depends on. */
export interface RedisTracingChannel<T extends object> {
  subscribe(subs: Partial<RedisTracingChannelSubscribers<T>>): void;
}

/**
 * Platform-provided factory that returns a tracing channel for the given
 * channel name. Implementations are responsible for ensuring that, when the
 * channel's `start` event fires, the span returned by `transformStart(data)`
 * ends up stored on `data._sentrySpan` so the subscriber's `asyncEnd`/`error`
 * handlers can read it.
 *
 * - Node passes `@sentry/opentelemetry/tracing-channel` which uses
 *   `bindStore` to also propagate the span as the active OTel context.
 * - Deno (and other non-OTel runtimes) pass a portable wrapper around
 *   `node:diagnostics_channel.tracingChannel` that just stamps
 *   `data._sentrySpan` in `start` without `bindStore`.
 */
export type RedisTracingChannelFactory = <T extends object>(
  name: string,
  transformStart: (data: T) => Span,
) => RedisTracingChannel<T>;

let subscribed = false;
let currentResponseHook: RedisDiagnosticChannelResponseHook | undefined;

/**
 * Subscribe Sentry span handlers to node-redis and ioredis diagnostics-channel
 * events: `node-redis:command`/`:batch`/`:connect` (published by node-redis
 * >= 5.12.0) and `ioredis:command`/`:connect` (published by ioredis >= 5.11.0).
 *
 * On older client versions the channels are never published to, so subscribers
 * are inert — there is no double-instrumentation against any IITM-based
 * patcher gated to those older versions.
 *
 * Idempotent: subsequent calls update the response hook but do not
 * re-subscribe.
 */
export function subscribeRedisDiagnosticChannels(
  tracingChannel: RedisTracingChannelFactory,
  responseHook?: RedisDiagnosticChannelResponseHook,
): void {
  currentResponseHook = responseHook;
  if (subscribed) return;
  subscribed = true;

  try {
    // node-redis: command name appears as args[0] in the channel payload, so
    // strip it before the statement and response hook see it.
    setupCommandChannel<RedisCommandData>(tracingChannel, REDIS_DC_CHANNEL_COMMAND, data => data.args.slice(1));
    setupBatchChannel(tracingChannel, REDIS_DC_CHANNEL_BATCH, data =>
      data.batchMode === 'PIPELINE' ? 'PIPELINE' : 'MULTI',
    );
    setupConnectChannel(tracingChannel, REDIS_DC_CHANNEL_CONNECT);

    // ioredis: args already exclude the command name; no slicing needed. And
    // ioredis has no separate batch channel — pipeline/MULTI metadata rides
    // on the per-command payload via `batchMode`/`batchSize`.
    setupCommandChannel<IORedisCommandData>(tracingChannel, IOREDIS_DC_CHANNEL_COMMAND, data => data.args);
    setupConnectChannel(tracingChannel, IOREDIS_DC_CHANNEL_CONNECT);
  } catch {
    // The factory may rely on `node:diagnostics_channel`, which isn't always
    // available. Fail closed; the SDK simply won't emit redis spans here.
    DEBUG_BUILD && debug.log('Redis node:diagnostics_channel subscription failed.');
  }
}

function setupCommandChannel<T extends RedisCommandData | IORedisCommandData>(
  tracingChannel: RedisTracingChannelFactory,
  channelName: string,
  getCommandArgs: (data: T) => string[],
): void {
  const channel = tracingChannel<T>(channelName, data => {
    // `args` is already sanitized by the publishing library (node-redis /
    // ioredis call their own `sanitizeArgs` before publishing). Join with
    // spaces to mirror the format the libraries themselves intend.
    const args = getCommandArgs(data);
    const statement = args.length ? `${data.command} ${args.join(' ')}` : data.command;
    return startSpanManual(
      {
        name: `redis-${data.command}`,
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'db.redis',
          [ATTR_DB_SYSTEM]: DB_SYSTEM_VALUE_REDIS,
          [ATTR_DB_STATEMENT]: statement,
          ...(data.serverAddress != null ? { [ATTR_NET_PEER_NAME]: data.serverAddress } : {}),
          ...(data.serverPort != null ? { [ATTR_NET_PEER_PORT]: data.serverPort } : {}),
        },
      },
      span => span,
    );
  });

  channel.subscribe({
    start: NOOP,
    asyncStart: NOOP,
    end: NOOP,
    asyncEnd: data => {
      const span = data._sentrySpan;
      // Only end here if the error handler isn't going to.
      if (!span || data.error) return;
      runResponseHook(span, data.command, getCommandArgs(data), data.result);
      span.end();
    },
    error: data => {
      const span = data._sentrySpan;
      if (!span) return;
      if (data.error) {
        span.setStatus({ code: SPAN_STATUS_ERROR, message: data.error.message });
      }
      span.end();
    },
  });
}

function setupBatchChannel(
  tracingChannel: RedisTracingChannelFactory,
  channelName: string,
  getOperationName: (data: RedisBatchData) => string,
): void {
  const channel = tracingChannel<RedisBatchData>(channelName, data => {
    return startSpanManual(
      {
        name: getOperationName(data),
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'db.redis',
          [ATTR_DB_SYSTEM]: DB_SYSTEM_VALUE_REDIS,
          ...(data.batchSize != null ? { 'db.redis.batch_size': data.batchSize } : {}),
          ...(data.serverAddress != null ? { [ATTR_NET_PEER_NAME]: data.serverAddress } : {}),
          ...(data.serverPort != null ? { [ATTR_NET_PEER_PORT]: data.serverPort } : {}),
        },
      },
      span => span,
    );
  });

  channel.subscribe({
    start: NOOP,
    asyncStart: NOOP,
    end: NOOP,
    asyncEnd: data => {
      if (!data.error) data._sentrySpan?.end();
    },
    error: data => {
      const span = data._sentrySpan;
      if (!span) return;
      if (data.error) {
        span.setStatus({ code: SPAN_STATUS_ERROR, message: data.error.message });
      }
      span.end();
    },
  });
}

function setupConnectChannel(tracingChannel: RedisTracingChannelFactory, channelName: string): void {
  const channel = tracingChannel<RedisConnectData>(channelName, data => {
    return startSpanManual(
      {
        name: 'redis-connect',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'db.redis.connect',
          [ATTR_DB_SYSTEM]: DB_SYSTEM_VALUE_REDIS,
          ...(data.serverAddress != null ? { [ATTR_NET_PEER_NAME]: data.serverAddress } : {}),
          ...(data.serverPort != null ? { [ATTR_NET_PEER_PORT]: data.serverPort } : {}),
        },
      },
      span => span,
    );
  });

  channel.subscribe({
    start: NOOP,
    asyncStart: NOOP,
    end: NOOP,
    asyncEnd: data => {
      if (!data.error) data._sentrySpan?.end();
    },
    error: data => {
      const span = data._sentrySpan;
      if (!span) return;
      if (data.error) {
        span.setStatus({ code: SPAN_STATUS_ERROR, message: data.error.message });
      }
      span.end();
    },
  });
}

function runResponseHook(span: Span, command: string, args: string[], result: unknown): void {
  const hook = currentResponseHook;
  if (!hook) return;
  try {
    hook(span, command, args, result);
  } catch {
    // never let user hooks break instrumentation
  }
}

/** Test-only: reset module-local subscribe state. */
export function _resetRedisDiagnosticChannelsForTesting(): void {
  subscribed = false;
  currentResponseHook = undefined;
}
