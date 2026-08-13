/* eslint-disable @typescript-eslint/no-deprecated -- the net attributes are still on the OLD semconv,
   matching `@opentelemetry/instrumentation-redis`. TODO(v11): switch to `server.address`/`server.port`
   and drop this disable. */
import * as diagnosticsChannel from 'node:diagnostics_channel';
import {
  DB_OPERATION_BATCH_SIZE,
  DB_QUERY_TEXT,
  DB_SYSTEM_NAME,
  NET_PEER_NAME,
  NET_PEER_PORT,
  SENTRY_KIND,
  SERVER_ADDRESS,
  SERVER_PORT,
  SENTRY_OP,
} from '@sentry/conventions/attributes';
import { DATABASE_DB_QUERY_SPAN_OP, DATABASE_DB_SPAN_OP } from '@sentry/conventions/op';
import type { IntegrationFn, Span, SpanAttributes } from '@sentry/core';
import {
  isObjectLike,
  defineIntegration,
  getActiveSpan,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SPAN_STATUS_ERROR,
  startInactiveSpan,
  withActiveSpan,
  waitForTracingChannelBinding,
} from '@sentry/core';
import { CHANNELS } from '../../orchestrion/channels';
import { defaultDbStatementSerializer } from './redis-statement-serializer';
import type { RedisCacheOptions } from './redis-cache';
import { applyRedisCacheAttributes } from './redis-cache';
import { bindTracingChannelToSpan } from '../../tracing-channel';
import { redisModuleNames } from '../../orchestrion/config/redis';
import { ioredisModuleNames } from '../../orchestrion/config/ioredis';
import { invokeOrchestrionInstrumentation } from '../../orchestrion/instrumentation';
import { subscribeRedisDiagnosticChannels } from './redis-dc-subscriber';
import { instrumentIoredis } from './ioredis-channel-subscriber';

const INTEGRATION_NAME = 'Redis' as const;

const ORIGIN = 'auto.db.redis';

// todo(v11): drop this — it is already covered by host and port.
const ATTR_DB_CONNECTION_STRING = 'db.connection_string';
const DB_SYSTEM_VALUE_REDIS = 'redis';

export interface RedisIntegrationOptions extends RedisCacheOptions {}

/** Structural type for a node-redis (`@redis/client`) command definition. */
interface RedisCommandDefinition {
  transformArguments?: (...args: unknown[]) => Array<string | Buffer>;
}

/** Structural type for the `command_obj` `redis` v2-v3 passes to `internal_send_command`. */
interface LegacyRedisCommand {
  command: string;
  args: Array<string | Buffer>;
  callback?: (err: Error | null | undefined, reply: unknown) => unknown;
}

interface LegacyRedisClient {
  connection_options?: { host?: string; port?: number };
  address?: string;
}

interface NodeRedisClientOptions {
  socket?: { host?: string; port?: number };
  url?: string;
}

interface NodeRedisClient {
  options?: NodeRedisClientOptions;
}

interface CommandContext {
  arguments?: unknown[];
  self?: unknown;
  result?: unknown;
  error?: unknown;
}

function endSpan(span: Span, err: unknown): void {
  if (err) {
    span.setStatus({ code: SPAN_STATUS_ERROR, message: err instanceof Error ? err.message : String(err) });
  }
  span.end();
}

// Strip a leading `commandOptions(...)` object (tagged with a `Symbol`) before
// deriving the wire arguments, mirroring `@redis/client`'s `transformCommandArguments`.
function stripCommandOptions(args: unknown[]): unknown[] {
  const first = args[0];
  if (isObjectLike(first) && Object.getOwnPropertySymbols(first).length > 0) {
    return args.slice(1);
  }
  return args;
}

function removeCredentialsFromConnectionString(url: string | undefined): string | undefined {
  if (typeof url !== 'string' || !url) {
    return undefined;
  }
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete('user_pwd');
    parsed.username = '';
    parsed.password = '';
    return parsed.href;
  } catch {
    return undefined;
  }
}

function nodeRedisAttributes(options: NodeRedisClientOptions | undefined): SpanAttributes {
  return {
    [DB_SYSTEM_NAME]: DB_SYSTEM_VALUE_REDIS,
    [NET_PEER_NAME]: options?.socket?.host,
    [NET_PEER_PORT]: options?.socket?.port,
    [ATTR_DB_CONNECTION_STRING]: removeCredentialsFromConnectionString(options?.url),
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
  };
}

function startCommandSpan(commandName: string, commandArgs: Array<string | Buffer>, attributes: SpanAttributes): Span {
  const dbStatement = defaultDbStatementSerializer(commandName, commandArgs);
  return startInactiveSpan({
    name: dbStatement || `redis-${commandName}`,
    attributes: {
      [SENTRY_KIND]: 'client',
      ...attributes,
      [SENTRY_OP]: DATABASE_DB_QUERY_SPAN_OP,
      [DB_QUERY_TEXT]: dbStatement,
    },
  });
}

// --- redis v2-v3: `RedisClient.prototype.internal_send_command(command_obj)` ---

// Settles via `command_obj.callback`, not the sync return — so instead of
// `bindTracingChannelToSpan` we open the span in `start`, wrap the callback to end it, and end on `error` for sync throws.
function subscribeLegacyRedisCommand(cacheOptions: RedisCacheOptions): void {
  const channel = diagnosticsChannel.tracingChannel<CommandContext>(CHANNELS.REDIS_COMMAND);
  const noop = (): void => {};
  channel.subscribe({
    end: noop,
    asyncStart: noop,
    asyncEnd: noop,
    start(data) {
      const command = data.arguments?.[0] as LegacyRedisCommand | undefined;
      if (!command || typeof command !== 'object') {
        return;
      }
      // The span is ended via the wrapped callback (or the sync-throw `error` path). A
      // command with no callback has no completion signal to end it on, so don't open one.
      const originalCallback = command.callback;
      if (typeof originalCallback !== 'function') {
        return;
      }
      const client = data.self as LegacyRedisClient | undefined;
      const attributes: SpanAttributes = {
        [DB_SYSTEM_NAME]: DB_SYSTEM_VALUE_REDIS,
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
      };

      attributes[NET_PEER_NAME] = client?.connection_options?.host;
      attributes[NET_PEER_PORT] = client?.connection_options?.port;

      if (client?.address) {
        attributes[ATTR_DB_CONNECTION_STRING] = `redis://${client.address}`;
      }
      const span = startCommandSpan(command.command, command.args ?? [], attributes);
      (data as CommandContext & { _sentrySpan?: Span })._sentrySpan = span;

      const parentSpan = getActiveSpan();
      command.callback = function (this: unknown, err: Error | null | undefined, reply: unknown) {
        if (!err) {
          applyRedisCacheAttributes(span, command.command, command.args ?? [], reply, cacheOptions);
        }
        endSpan(span, err);
        // eslint-disable-next-line prefer-rest-params
        const args = arguments as unknown as [Error | null | undefined, unknown];
        return withActiveSpan(parentSpan ?? null, () => originalCallback.apply(this, args));
      };
    },
    error(data) {
      // Synchronous throw: the wrapped callback never fires, so end here instead.
      const span = (data as CommandContext & { _sentrySpan?: Span })._sentrySpan;
      if (span) {
        endSpan(span, data.error);
      }
    },
  });
}

// --- node-redis v4/v5 (`@redis/client`) ---

function bindNodeRedisCommandChannel(
  channelName: string,
  getWireArgs: (data: CommandContext) => Array<string | Buffer> | undefined,
  cacheOptions: RedisCacheOptions,
): void {
  const channel = diagnosticsChannel.tracingChannel<CommandContext, CommandContext>(channelName);
  bindTracingChannelToSpan(
    channel,
    data => {
      const wireArgs = getWireArgs(data);
      if (!wireArgs?.length) {
        return undefined;
      }
      const commandName = String(wireArgs[0]);
      const options = (data.self as NodeRedisClient | undefined)?.options;
      return startCommandSpan(commandName, wireArgs.slice(1), nodeRedisAttributes(options));
    },
    {
      beforeSpanEnd(span, data) {
        if ('error' in data) {
          return;
        }
        const wireArgs = getWireArgs(data);
        if (wireArgs?.length) {
          applyRedisCacheAttributes(span, String(wireArgs[0]), wireArgs.slice(1), data.result, cacheOptions);
        }
      },
    },
  );
}

// `sendCommand(args, options)` — `args` are already the wire arguments.
function getSendCommandArgs(data: CommandContext): Array<string | Buffer> | undefined {
  const args = data.arguments?.[0];
  return Array.isArray(args) ? (args as Array<string | Buffer>) : undefined;
}

// `commandsExecutor(command, jsArgs)` — derive the wire arguments the same way
// `@redis/client` does internally, via `command.transformArguments`.
function getExecutorArgs(data: CommandContext): Array<string | Buffer> | undefined {
  const command = data.arguments?.[0] as RedisCommandDefinition | undefined;
  const jsArgs = data.arguments?.[1];
  if (typeof command?.transformArguments !== 'function' || !Array.isArray(jsArgs)) {
    return undefined;
  }
  try {
    return command.transformArguments(...stripCommandOptions(jsArgs));
  } catch {
    return undefined;
  }
}

function bindNodeRedisConnectChannel(): void {
  const channel = diagnosticsChannel.tracingChannel<CommandContext, CommandContext>(CHANNELS.NODE_REDIS_CONNECT);
  bindTracingChannelToSpan(channel, data => {
    const options = (data.self as NodeRedisClient | undefined)?.options;
    return startInactiveSpan({
      name: 'redis-connect',
      attributes: {
        [SENTRY_KIND]: 'client',
        ...nodeRedisAttributes(options),
        [SENTRY_OP]: DATABASE_DB_SPAN_OP,
      },
    });
  });
}

// Batch (multi/pipeline): one span per `exec`. Batched commands bypass `sendCommand`, so
// the executor's `ctx.arguments[0]` (the queued commands) gives the batch size. Span shape
// mirrors the native `node-redis:batch` span (see `redis-dc-subscriber.ts`).
function bindNodeRedisBatchChannel(channelName: string, getOperation: (data: CommandContext) => string): void {
  const channel = diagnosticsChannel.tracingChannel<CommandContext, CommandContext>(channelName);
  bindTracingChannelToSpan(channel, data => {
    const commands = data.arguments?.[0];
    const size = Array.isArray(commands) ? commands.length : undefined;
    const socket = (data.self as NodeRedisClient | undefined)?.options?.socket;
    return startInactiveSpan({
      name: getOperation(data),
      attributes: {
        [SENTRY_KIND]: 'client',
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
        [SENTRY_OP]: DATABASE_DB_QUERY_SPAN_OP,
        [DB_SYSTEM_NAME]: DB_SYSTEM_VALUE_REDIS,
        ...(size && size > 1 ? { [DB_OPERATION_BATCH_SIZE]: size } : {}),
        ...(socket?.host != null ? { [SERVER_ADDRESS]: socket.host } : {}),
        ...(socket?.port != null ? { [SERVER_PORT]: socket.port } : {}),
      },
    });
  });
}

const _redisIntegration = ((options: RedisIntegrationOptions = {}) => {
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      // redis v2-v3 uses a nested callback, not `bindStore`, so it subscribes
      // without the async-context binding. Kept separate so a missing binding
      // never defers it: on the bundler path the wait would push subscription
      // past `Sentry.init()` and early commands would emit with no subscriber
      invokeOrchestrionInstrumentation(client, redisModuleNames, instrumentLegacyRedis, [options], {
        requiresTracingChannelBinding: false,
      });
      // node-redis v4/v5 binds spans into async context via `bindTracingChannelToSpan`.
      invokeOrchestrionInstrumentation(client, redisModuleNames, instrumentNodeRedis, [options]);
      // ioredis `<5.11.0` (>=5.11.0 publishes its own `ioredis:*` channel, handled in `setupOnce`).
      invokeOrchestrionInstrumentation(client, ioredisModuleNames, instrumentIoredis, [options]);
    },
    setupOnce() {
      if (!diagnosticsChannel.tracingChannel) {
        return;
      }

      waitForTracingChannelBinding(() => {
        subscribeRedisDiagnosticChannels(diagnosticsChannel.tracingChannel, options);
      });
    },
  };
}) satisfies IntegrationFn;

function instrumentLegacyRedis(options: RedisIntegrationOptions): void {
  subscribeLegacyRedisCommand(options);
}

function instrumentNodeRedis(options: RedisIntegrationOptions): void {
  bindNodeRedisCommandChannel(CHANNELS.NODE_REDIS_COMMAND, getSendCommandArgs, options);
  bindNodeRedisCommandChannel(CHANNELS.NODE_REDIS_EXECUTOR, getExecutorArgs, options);
  bindNodeRedisConnectChannel();
  bindNodeRedisBatchChannel(CHANNELS.NODE_REDIS_MULTI, () => 'MULTI');
  bindNodeRedisBatchChannel(CHANNELS.NODE_REDIS_PIPELINE, () => 'PIPELINE');
  bindNodeRedisBatchChannel(CHANNELS.NODE_REDIS_BATCH, data =>
    data.arguments?.[2] !== undefined ? 'MULTI' : 'PIPELINE',
  );
}

/**
 * Adds Sentry tracing instrumentation for the [redis](https://www.npmjs.com/package/redis) and
 * [ioredis](https://www.npmjs.com/package/ioredis) libraries.
 *
 * A single integration covers every client version: `redis` v2-v3, node-redis v4/v5 (`@redis/client`)
 * and ioredis `<5.11.0` via orchestrion channels, and node-redis `>=5.12.0` / ioredis `>=5.11.0` via
 * their native `diagnostics_channel`. Captures single commands, `connect`, and multi/pipeline batches,
 * plus cache spans for keys matching the configured `cachePrefixes`.
 *
 * @example
 * ```javascript
 * const Sentry = require('@sentry/node');
 *
 * Sentry.init({
 *  integrations: [Sentry.redisIntegration()],
 * });
 * ```
 */
export const redisIntegration = defineIntegration(_redisIntegration);
