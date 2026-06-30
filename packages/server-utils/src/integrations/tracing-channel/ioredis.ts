import * as diagnosticsChannel from 'node:diagnostics_channel';
import type { IntegrationFn, Span } from '@sentry/core';
import {
  debug,
  defineIntegration,
  getActiveSpan,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  startInactiveSpan,
  waitForTracingChannelBinding,
} from '@sentry/core';
import { DEBUG_BUILD } from '../../debug-build';
import { CHANNELS } from '../../orchestrion/channels';
import { defaultDbStatementSerializer } from '../../redis/redis-statement-serializer';
import { bindTracingChannelToSpan } from '../../tracing-channel';

// Distinct from the OTel `Redis` integration, which is composite (node-redis +
// ioredis + the >=5.11.0 diagnostics_channel subscriber) and stays in the set;
// only its ioredis monkey-patch is gated off in the node SDK when this is active.
const INTEGRATION_NAME = 'IORedis' as const;

const ORIGIN = 'auto.db.orchestrion.redis';
const ATTR_DB_SYSTEM = 'db.system';
const ATTR_DB_STATEMENT = 'db.statement';
const ATTR_DB_CONNECTION_STRING = 'db.connection_string';
const ATTR_NET_PEER_NAME = 'net.peer.name';
const ATTR_NET_PEER_PORT = 'net.peer.port';

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
    [ATTR_DB_SYSTEM]: 'redis',
    [ATTR_DB_CONNECTION_STRING]: `redis://${host}:${port}`,
    [ATTR_NET_PEER_NAME]: host,
    [ATTR_NET_PEER_PORT]: port,
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
  };
}

const _ioredisChannelIntegration = ((options: IORedisChannelIntegrationOptions = {}) => {
  const responseHook = options.responseHook;

  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      // `tracingChannel` is unavailable before Node 18.19.
      if (!diagnosticsChannel.tracingChannel) {
        return;
      }

      DEBUG_BUILD &&
        debug.log(`[orchestrion:ioredis] subscribing to "${CHANNELS.IOREDIS_COMMAND}"/"${CHANNELS.IOREDIS_CONNECT}"`);

      const commandChannel = diagnosticsChannel.tracingChannel<IORedisCommandContext, IORedisCommandContext>(
        CHANNELS.IOREDIS_COMMAND,
      );
      const connectChannel = diagnosticsChannel.tracingChannel<IORedisConnectContext, IORedisConnectContext>(
        CHANNELS.IOREDIS_CONNECT,
      );

      // `bindTracingChannelToSpan` uses `bindStore`, which needs the async-context
      // binding that `initOpenTelemetry()` registers after integration `setupOnce` —
      // defer until it's available (matches the native redis diagnostics-channel subscriber).
      waitForTracingChannelBinding(() => {
        bindTracingChannelToSpan(
          commandChannel,
          data => {
            // ioredis' `requireParentSpan` default: only create a span under an active span.
            if (!getActiveSpan()) {
              return undefined;
            }
            const command = data.arguments?.[0] as RedisCommand | undefined;
            if (!command || typeof command !== 'object') {
              return undefined;
            }
            const { host, port } = getConnectionOptions(data.self);
            const statement = defaultDbStatementSerializer(command.name, command.args ?? []);
            return startInactiveSpan({
              name: statement,
              op: 'db',
              attributes: { ...connectionAttributes(host, port), [ATTR_DB_STATEMENT]: statement },
            });
          },
          {
            captureError: false,
            beforeSpanEnd(span, data) {
              if ('error' in data || !responseHook) {
                return;
              }
              const command = data.arguments?.[0] as RedisCommand | undefined;
              if (command) {
                runResponseHook(responseHook, span, command, data.result);
              }
            },
          },
        );

        bindTracingChannelToSpan(
          connectChannel,
          data => {
            if (!getActiveSpan()) {
              return undefined;
            }
            const { host, port } = getConnectionOptions(data.self);
            return startInactiveSpan({
              name: 'connect',
              op: 'db',
              attributes: { ...connectionAttributes(host, port), [ATTR_DB_STATEMENT]: 'connect' },
            });
          },
          { captureError: false },
        );
      });
    },
  };
}) satisfies IntegrationFn;

function runResponseHook(hook: IORedisResponseHook, span: Span, command: RedisCommand, result: unknown): void {
  try {
    hook(span, command.name, command.args, result);
  } catch {
    // never let a user-provided response hook break instrumentation
  }
}

/**
 * EXPERIMENTAL — orchestrion-driven ioredis integration. Subscribes to
 * `orchestrion:ioredis:command` / `:connect` (injected into ioredis' `<5.11.0`
 * `sendCommand`/`connect`) and creates db spans matching
 * `@opentelemetry/instrumentation-ioredis`. Requires the orchestrion runtime hook
 * or bundler plugin.
 */
export const ioredisChannelIntegration = defineIntegration(_ioredisChannelIntegration);
