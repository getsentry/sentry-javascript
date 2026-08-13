/* eslint-disable @typescript-eslint/no-deprecated -- we intentionally emit the OLD db/net semconv
   to match `@opentelemetry/instrumentation-ioredis` (and Sentry's `inferDbSpanData`, which keys off
   `db.statement`). TODO(v11): switch to the non-deprecated `db.system.name`/`db.query.text`/
   `server.address`/`server.port` conventions and drop this disable. */
import * as diagnosticsChannel from 'node:diagnostics_channel';
import { DB_STATEMENT, DB_SYSTEM, NET_PEER_NAME, NET_PEER_PORT } from '@sentry/conventions/attributes';
import type { Span } from '@sentry/core';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, startInactiveSpan } from '@sentry/core';
import { CHANNELS } from '../../orchestrion/channels';
import { bindTracingChannelToSpan } from '../../tracing-channel';
import type { RedisCacheOptions } from './redis-cache';
import { applyRedisCacheAttributes } from './redis-cache';
import { defaultDbStatementSerializer } from './redis-statement-serializer';

const ORIGIN = 'auto.db.redis';

// todo(v11): Let's drop this as this is already covered with host and port
const ATTR_DB_CONNECTION_STRING = 'db.connection_string';

/** Structural type for the command object ioredis passes to `sendCommand`. */
interface RedisCommand {
  name: string;
  args: Array<string | Buffer>;
}

interface RedisClientLike {
  options?: { host?: string; port?: number };
}

interface IORedisCommandContext {
  arguments?: unknown[];
  self?: RedisClientLike;
  result?: unknown;
  error?: unknown;
}

type IORedisConnectContext = Omit<IORedisCommandContext, 'arguments'>;

function getConnectionOptions(self: RedisClientLike | undefined): { host?: string; port?: number } {
  return { host: self?.options?.host, port: self?.options?.port };
}

function connectionAttributes(host: string | undefined, port: number | undefined): Record<string, unknown> {
  return {
    [DB_SYSTEM]: 'redis',
    [ATTR_DB_CONNECTION_STRING]: `redis://${host}:${port}`,
    [NET_PEER_NAME]: host,
    [NET_PEER_PORT]: port,
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
  };
}

// ioredis re-enters `sendCommand` with the same command object when it drains
// the offline queue on connect which leads to duplicate spans.
// Track commands we've already traced so each logical command produces one span.
const tracedCommands = new WeakSet<object>();

/**
 * Builds the db span for an `orchestrion:ioredis:command` payload, or returns `undefined` to skip
 * it: for a non-command payload, or the offline-queue re-send of an already-traced command.
 *
 * Exported for unit testing.
 */
export function startIORedisCommandSpan(data: IORedisCommandContext): Span | undefined {
  const command = data.arguments?.[0] as RedisCommand | undefined;
  if (!command || typeof command !== 'object') {
    return undefined;
  }
  // guard against duplicate spans
  if (tracedCommands.has(command)) {
    return undefined;
  }
  tracedCommands.add(command);
  const { host, port } = getConnectionOptions(data.self);
  const statement = defaultDbStatementSerializer(command.name, command.args ?? []);
  return startInactiveSpan({
    name: statement,
    op: 'db',
    attributes: { ...connectionAttributes(host, port), [DB_STATEMENT]: statement },
  });
}

/**
 * Subscribes to `orchestrion:ioredis:command` / `:connect` (injected into ioredis' `<5.11.0`
 * `sendCommand`/`connect`) and creates db spans matching `@opentelemetry/instrumentation-ioredis`.
 * ioredis `>=5.11.0` publishes its own `ioredis:*` diagnostics_channel, handled by the native
 * subscriber in `redis-dc-subscriber.ts` instead.
 */
export function instrumentIoredis(options: RedisCacheOptions): void {
  const commandChannel = diagnosticsChannel.tracingChannel<IORedisCommandContext, IORedisCommandContext>(
    CHANNELS.IOREDIS_COMMAND,
  );
  const connectChannel = diagnosticsChannel.tracingChannel<IORedisConnectContext, IORedisConnectContext>(
    CHANNELS.IOREDIS_CONNECT,
  );

  bindTracingChannelToSpan(commandChannel, startIORedisCommandSpan, {
    // ioredis' `requireParentSpan` default: only create a span under an active span.
    requiresParentSpan: true,
    beforeSpanEnd(span, data) {
      if ('error' in data) {
        return;
      }
      const command = data.arguments?.[0] as RedisCommand | undefined;
      if (command) {
        applyRedisCacheAttributes(span, command.name, command.args, data.result, options);
      }
    },
  });

  bindTracingChannelToSpan(
    connectChannel,
    data => {
      const { host, port } = getConnectionOptions(data.self);
      return startInactiveSpan({
        name: 'connect',
        op: 'db',
        attributes: { ...connectionAttributes(host, port), [DB_STATEMENT]: 'connect' },
      });
    },
    { requiresParentSpan: true },
  );
}
