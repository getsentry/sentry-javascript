import type { TracingChannel } from 'node:diagnostics_channel';
import {
  DB_OPERATION_BATCH_SIZE,
  DB_QUERY_TEXT,
  DB_SYSTEM_NAME,
  SERVER_ADDRESS,
  SERVER_PORT,
} from '@sentry/conventions/attributes';
import type { Span } from '@sentry/core';
import { debug, SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, startInactiveSpan } from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build';
import { bindTracingChannelToSpanWithLifeCycle } from '../tracing-channel';

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
const DB_SYSTEM_NAME_VALUE_REDIS = 'redis';

/**
 * Shape of the `node-redis:command` channel payload published by node-redis.
 *
 * Both `command` and `args` are already redacted by node-redis itself (see
 * `sanitizeArgs` in @redis/client) using the OTel `redis-common` rules. The
 * arg array is `[<command>, <safe arg>, ..., '?', ...]` — `?` replaces any
 * value the library considers sensitive. Subscribers can emit `args` directly
 * as `db.query.text` without further serialization.
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
 * Platform-provided factory that creates a native tracing channel for the given name. The
 * subscriber binds the span and its lifecycle onto the channel via `bindTracingChannelToSpan`,
 * which propagates the active span through the runtime's async context.
 *
 * Both Node and Deno pass `node:diagnostics_channel`'s `tracingChannel` directly.
 */
export type RedisTracingChannelFactory = <T extends object>(name: string) => TracingChannel<T, T>;

let subscribed = false;
let currentResponseHook: RedisDiagnosticChannelResponseHook | undefined;
let activeUnbinds: Array<() => void> = [];

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
    activeUnbinds.push(
      setupCommandChannel<RedisCommandData>(tracingChannel, REDIS_DC_CHANNEL_COMMAND, data => data.args.slice(1)),
      setupBatchChannel(tracingChannel, REDIS_DC_CHANNEL_BATCH, data =>
        data.batchMode === 'PIPELINE' ? 'PIPELINE' : 'MULTI',
      ),
      setupConnectChannel(tracingChannel, REDIS_DC_CHANNEL_CONNECT),
      // ioredis: args already exclude the command name; no slicing needed. And
      // ioredis has no separate batch channel — pipeline/MULTI metadata rides
      // on the per-command payload via `batchMode`/`batchSize`.
      setupCommandChannel<IORedisCommandData>(tracingChannel, IOREDIS_DC_CHANNEL_COMMAND, data => data.args),
      setupConnectChannel(tracingChannel, IOREDIS_DC_CHANNEL_CONNECT),
    );
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
): () => void {
  return bindTracingChannelToSpanWithLifeCycle(
    tracingChannel<T>(channelName),
    data => {
      // `args` is already sanitized by the publishing library (node-redis /
      // ioredis call their own `sanitizeArgs` before publishing). Join with
      // spaces to mirror the format the libraries themselves intend.
      const args = getCommandArgs(data);
      const statement = args.length ? `${data.command} ${args.join(' ')}` : data.command;
      return startInactiveSpan({
        name: `redis-${data.command}`,
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'db.redis',
          [DB_SYSTEM_NAME]: DB_SYSTEM_NAME_VALUE_REDIS,
          [DB_QUERY_TEXT]: statement,
          ...(data.serverAddress != null ? { [SERVER_ADDRESS]: data.serverAddress } : {}),
          ...(data.serverPort != null ? { [SERVER_PORT]: data.serverPort } : {}),
        },
      });
    },
    {
      // Command failures are surfaced to (and usually handled by) the caller; only annotate the
      // span so we don't emit a duplicate error event for every failed command.
      captureError: false,
      beforeSpanEnd(span, data) {
        if ('error' in data) return;
        runResponseHook(span, data.command, getCommandArgs(data), data.result);
      },
    },
  ).unbind;
}

function setupBatchChannel(
  tracingChannel: RedisTracingChannelFactory,
  channelName: string,
  getOperationName: (data: RedisBatchData) => string,
): () => void {
  return bindTracingChannelToSpanWithLifeCycle(
    tracingChannel<RedisBatchData>(channelName),
    data => {
      return startInactiveSpan({
        name: getOperationName(data),
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'db.redis',
          [DB_SYSTEM_NAME]: DB_SYSTEM_NAME_VALUE_REDIS,
          // should only include batch size greater than 1,
          // or else it isn't properly considered a "batch"
          ...(Number(data.batchSize) > 1 ? { [DB_OPERATION_BATCH_SIZE]: data.batchSize } : {}),
          ...(data.serverAddress != null ? { [SERVER_ADDRESS]: data.serverAddress } : {}),
          ...(data.serverPort != null ? { [SERVER_PORT]: data.serverPort } : {}),
        },
      });
    },
    { captureError: false },
  ).unbind;
}

function setupConnectChannel(tracingChannel: RedisTracingChannelFactory, channelName: string): () => void {
  return bindTracingChannelToSpanWithLifeCycle(
    tracingChannel<RedisConnectData>(channelName),
    data => {
      return startInactiveSpan({
        name: 'redis-connect',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'db.redis.connect',
          [DB_SYSTEM_NAME]: DB_SYSTEM_NAME_VALUE_REDIS,
          ...(data.serverAddress != null ? { [SERVER_ADDRESS]: data.serverAddress } : {}),
          ...(data.serverPort != null ? { [SERVER_PORT]: data.serverPort } : {}),
        },
      });
    },
    { captureError: false },
  ).unbind;
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

/** Test-only: detach all channel bindings and reset module-local subscribe state. */
export function _resetRedisDiagnosticChannelsForTesting(): void {
  activeUnbinds.forEach(unbind => unbind());
  activeUnbinds = [];
  subscribed = false;
  currentResponseHook = undefined;
}
