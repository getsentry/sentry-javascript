import * as diagnosticsChannel from 'node:diagnostics_channel';
import {
  DB_OPERATION_NAME,
  DB_QUERY_TEXT,
  DB_SYSTEM_NAME,
  SENTRY_KIND,
  SENTRY_OP,
  SERVER_ADDRESS,
  SERVER_PORT,
} from '@sentry/conventions/attributes';
import { DATABASE_DB_QUERY_SPAN_OP, DATABASE_DB_SPAN_OP } from '@sentry/conventions/op';
import type { IntegrationFn, Span } from '@sentry/core';
import { defineIntegration, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, startInactiveSpan } from '@sentry/core';
import { CHANNELS } from '../orchestrion/channels';
import { defaultDbStatementSerializer } from '../redis/redis-statement-serializer';
import { bindTracingChannelToSpan } from '../tracing-channel';
import { ioredisModuleNames } from '../orchestrion/config/ioredis';
import { invokeOrchestrionInstrumentation } from '../orchestrion/instrumentation';

// Distinct from the OTel `Redis` integration, which is composite (node-redis +
// ioredis + the >=5.11.0 diagnostics_channel subscriber) and stays in the set;
// only its ioredis monkey-patch is gated off in the node SDK when this is active.
const INTEGRATION_NAME = 'IORedis' as const;

const ORIGIN = 'auto.db.redis';

const DB_SYSTEM_VALUE_REDIS = 'redis';

/** Mirrors `@opentelemetry/instrumentation-ioredis`' response hook. Not called for failed commands. */
export type IORedisResponseHook = (span: Span, command: string, args: Array<string | Buffer>, result: unknown) => void;

export interface IORedisChannelIntegrationOptions {
  responseHook?: IORedisResponseHook;
}

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
    [DB_SYSTEM_NAME]: DB_SYSTEM_VALUE_REDIS,
    ...(host != null ? { [SERVER_ADDRESS]: host } : {}),
    ...(port != null ? { [SERVER_PORT]: port } : {}),
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
    attributes: {
      [SENTRY_KIND]: 'client',
      ...connectionAttributes(host, port),
      [SENTRY_OP]: DATABASE_DB_QUERY_SPAN_OP,
      [DB_OPERATION_NAME]: command.name,
      [DB_QUERY_TEXT]: statement,
    },
  });
}

const _ioredisChannelIntegration = ((options: IORedisChannelIntegrationOptions = {}) => {
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      invokeOrchestrionInstrumentation(client, ioredisModuleNames, instrumentIoredis, [options]);
    },
  };
}) satisfies IntegrationFn;

function instrumentIoredis(options: IORedisChannelIntegrationOptions): void {
  const responseHook = options.responseHook;

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
      if ('error' in data || !responseHook) {
        return;
      }
      const command = data.arguments?.[0] as RedisCommand | undefined;
      if (command) {
        runResponseHook(responseHook, span, command, data.result);
      }
    },
  });

  bindTracingChannelToSpan(
    connectChannel,
    data => {
      const { host, port } = getConnectionOptions(data.self);
      return startInactiveSpan({
        name: 'connect',
        attributes: {
          [SENTRY_KIND]: 'client',
          ...connectionAttributes(host, port),
          [SENTRY_OP]: DATABASE_DB_SPAN_OP,
        },
      });
    },
    { requiresParentSpan: true },
  );
}

function runResponseHook(hook: IORedisResponseHook, span: Span, command: RedisCommand, result: unknown): void {
  try {
    hook(span, command.name, command.args, result);
  } catch {
    // never let a user-provided response hook break instrumentation
  }
}

/**
 * Orchestrion-driven ioredis integration. Subscribes to
 * `orchestrion:ioredis:command` / `:connect` (injected into ioredis' `<5.11.0`
 * `sendCommand`/`connect`) and creates db spans matching
 * `@opentelemetry/instrumentation-ioredis`. Requires the orchestrion runtime hook
 * or bundler plugin.
 */
export const ioredisChannelIntegration = defineIntegration(_ioredisChannelIntegration);
