/* eslint-disable @typescript-eslint/no-deprecated -- we intentionally emit the OLD db/net semconv
   to match `@opentelemetry/instrumentation-redis`. TODO(v11): switch to the non-deprecated
   `db.system.name`/`db.query.text`/`server.address`/`server.port` conventions and drop this disable. */
import * as diagnosticsChannel from 'node:diagnostics_channel';
import {
  DB_OPERATION_BATCH_SIZE,
  DB_STATEMENT,
  DB_SYSTEM,
  DB_SYSTEM_NAME,
  NET_PEER_NAME,
  NET_PEER_PORT,
  SERVER_ADDRESS,
  SERVER_PORT,
} from '@sentry/conventions/attributes';
import type { IntegrationFn, Span, SpanAttributes } from '@sentry/core';
import {
  isObjectLike,
  debug,
  defineIntegration,
  getActiveSpan,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SPAN_KIND,
  SPAN_STATUS_ERROR,
  startInactiveSpan,
  waitForTracingChannelBinding,
  withActiveSpan,
} from '@sentry/core';
import { DEBUG_BUILD } from '../../debug-build';
import { CHANNELS } from '../../orchestrion/channels';
import { defaultDbStatementSerializer } from '../../redis/redis-statement-serializer';
import { bindTracingChannelToSpan } from '../../tracing-channel';

// A distinct name from the composite OTel `Redis` integration — they can't share one, and
// `Redis` stays in the set for its native diagnostics_channel subscriber (node-redis >=5.12 /
// ioredis >=5.11). When this integration is active, the OTel `RedisInstrumentation` monkey-patch
// is fully gated off in the node SDK.
const INTEGRATION_NAME = 'RedisChannel' as const;

const ORIGIN = 'auto.db.orchestrion.redis';

// todo(v11): drop this — it is already covered by host and port.
const ATTR_DB_CONNECTION_STRING = 'db.connection_string';
const DB_SYSTEM_VALUE_REDIS = 'redis';

/** Mirrors `@opentelemetry/instrumentation-redis`' response hook. Not called for failed commands. */
export type RedisResponseHook = (span: Span, command: string, args: Array<string | Buffer>, result: unknown) => void;

export interface RedisChannelIntegrationOptions {
  responseHook?: RedisResponseHook;
}

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

function runResponseHook(
  hook: RedisResponseHook | undefined,
  span: Span,
  command: string,
  args: Array<string | Buffer>,
  result: unknown,
): void {
  if (!hook) {
    return;
  }
  try {
    hook(span, command, args, result);
  } catch {
    // never let a user-provided response hook break instrumentation
  }
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
    [DB_SYSTEM]: DB_SYSTEM_VALUE_REDIS,
    [NET_PEER_NAME]: options?.socket?.host,
    [NET_PEER_PORT]: options?.socket?.port,
    [ATTR_DB_CONNECTION_STRING]: removeCredentialsFromConnectionString(options?.url),
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
  };
}

function startCommandSpan(commandName: string, commandArgs: Array<string | Buffer>, attributes: SpanAttributes): Span {
  return startInactiveSpan({
    name: `redis-${commandName}`,
    kind: SPAN_KIND.CLIENT,
    attributes: {
      ...attributes,
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'db',
      [DB_STATEMENT]: defaultDbStatementSerializer(commandName, commandArgs),
    },
  });
}

// --- redis v2-v3: `RedisClient.prototype.internal_send_command(command_obj)` ---

// Settles via `command_obj.callback`, not the sync return — so instead of
// `bindTracingChannelToSpan` we open the span in `start`, wrap the callback to end it, and end on `error` for sync throws.
function subscribeLegacyRedisCommand(responseHook: RedisResponseHook | undefined): void {
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
        [DB_SYSTEM]: DB_SYSTEM_VALUE_REDIS,
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
          runResponseHook(responseHook, span, command.command, command.args ?? [], reply);
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
  responseHook: RedisResponseHook | undefined,
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
      captureError: false,
      beforeSpanEnd(span, data) {
        if ('error' in data || !responseHook) {
          return;
        }
        const wireArgs = getWireArgs(data);
        if (wireArgs?.length) {
          runResponseHook(responseHook, span, String(wireArgs[0]), wireArgs.slice(1), data.result);
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
  bindTracingChannelToSpan(
    channel,
    data => {
      const options = (data.self as NodeRedisClient | undefined)?.options;
      return startInactiveSpan({
        name: 'redis-connect',
        kind: SPAN_KIND.CLIENT,
        attributes: { ...nodeRedisAttributes(options), [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'db' },
      });
    },
    { captureError: false },
  );
}

// Batch (multi/pipeline): one span per `exec`. Batched commands bypass `sendCommand`, so
// the executor's `ctx.arguments[0]` (the queued commands) gives the batch size. Span shape
// mirrors the native `node-redis:batch` span (see `redis-dc-subscriber.ts`).
function bindNodeRedisBatchChannel(channelName: string, getOperation: (data: CommandContext) => string): void {
  const channel = diagnosticsChannel.tracingChannel<CommandContext, CommandContext>(channelName);
  bindTracingChannelToSpan(
    channel,
    data => {
      const commands = data.arguments?.[0];
      const size = Array.isArray(commands) ? commands.length : undefined;
      const socket = (data.self as NodeRedisClient | undefined)?.options?.socket;
      return startInactiveSpan({
        name: getOperation(data),
        kind: SPAN_KIND.CLIENT,
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'db.redis',
          [DB_SYSTEM_NAME]: DB_SYSTEM_VALUE_REDIS,
          ...(size && size > 1 ? { [DB_OPERATION_BATCH_SIZE]: size } : {}),
          ...(socket?.host != null ? { [SERVER_ADDRESS]: socket.host } : {}),
          ...(socket?.port != null ? { [SERVER_PORT]: socket.port } : {}),
        },
      });
    },
    { captureError: false },
  );
}

const _redisChannelIntegration = ((options: RedisChannelIntegrationOptions = {}) => {
  const responseHook = options.responseHook;

  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      if (!diagnosticsChannel.tracingChannel) {
        return;
      }

      DEBUG_BUILD &&
        debug.log(`[orchestrion:redis] subscribing to "${CHANNELS.REDIS_COMMAND}" and node-redis channels`);

      // redis v2-v3 uses a nested callback rather than `bindStore`, so it can be
      // subscribed synchronously here.
      subscribeLegacyRedisCommand(responseHook);

      waitForTracingChannelBinding(() => {
        bindNodeRedisCommandChannel(CHANNELS.NODE_REDIS_COMMAND, getSendCommandArgs, responseHook);
        bindNodeRedisCommandChannel(CHANNELS.NODE_REDIS_EXECUTOR, getExecutorArgs, responseHook);
        bindNodeRedisConnectChannel();
        bindNodeRedisBatchChannel(CHANNELS.NODE_REDIS_MULTI, () => 'MULTI');
        bindNodeRedisBatchChannel(CHANNELS.NODE_REDIS_PIPELINE, () => 'PIPELINE');
        bindNodeRedisBatchChannel(CHANNELS.NODE_REDIS_BATCH, data =>
          data.arguments?.[2] !== undefined ? 'MULTI' : 'PIPELINE',
        );
      });
    },
  };
}) satisfies IntegrationFn;

/**
 * EXPERIMENTAL — orchestrion-driven redis integration for `redis` v2-v3 and
 * node-redis v4/v5 `<5.12.0` (`@redis/client`). Covers single commands, `connect`,
 * and multi/pipeline batches, fully replacing `@opentelemetry/instrumentation-redis`.
 * Requires the orchestrion runtime hook or bundler plugin.
 */
export const redisChannelIntegration = defineIntegration(_redisChannelIntegration);
