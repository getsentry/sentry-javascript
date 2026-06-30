import * as diagnosticsChannel from 'node:diagnostics_channel';
import type { IntegrationFn, Scope } from '@sentry/core';
import {
  bindScopeToEmitter,
  debug,
  defineIntegration,
  getCurrentScope,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SPAN_STATUS_ERROR,
  startInactiveSpan,
  waitForTracingChannelBinding,
} from '@sentry/core';
import { DEBUG_BUILD } from '../../debug-build';
import { CHANNELS } from '../../orchestrion/channels';
import { bindTracingChannelToSpan } from '../../tracing-channel';

// NOTE: this uses the same name as the OTel integration by design.
// When enabled, OTel 'Mysql' integration is omitted from the default set.
const INTEGRATION_NAME = 'Mysql' as const;

// OpenTelemetry "OLD" db/net semantic-conventions. We inline them rather than
// importing `@opentelemetry/semantic-conventions` to keep this integration's
// dependency surface free of OTel — orchestrion's whole point is to step away
// from the OTel auto-instrumentation stack.
//
// We emit the OLD conventions to match `@opentelemetry/instrumentation-mysql`'s
// default (it only emits the stable `db.system.name` / `db.query.text` set when
// `OTEL_SEMCONV_STABILITY_OPT_IN=database` is opted into) and the rest of the
// Sentry JS SDK, whose `inferDbSpanData` processor renames spans based on
// `db.statement`.
const ATTR_DB_SYSTEM = 'db.system';
const ATTR_DB_CONNECTION_STRING = 'db.connection_string';
const ATTR_DB_NAME = 'db.name';
const ATTR_DB_USER = 'db.user';
const ATTR_DB_STATEMENT = 'db.statement';
const ATTR_NET_PEER_NAME = 'net.peer.name';
const ATTR_NET_PEER_PORT = 'net.peer.port';

/**
 * The shape orchestrion's transform attaches to the tracing-channel `context` object. Documented here
 * rather than imported because orchestrion's runtime doesn't export it.
 */
interface MysqlQueryChannelContext {
  // The live args array passed to the wrapped `connection.query` call; `arguments[0]` is the SQL.
  arguments: unknown[];
  self?: MysqlConnection;
  moduleVersion?: string;
  result?: unknown;
  error?: unknown;
  // The caller's scope, captured at `start` and replayed onto the streamed `Query` emitter (see below).
  _sentryCallerScope?: Scope;
}

interface MysqlConnectionConfig {
  host?: string;
  port?: number | string;
  database?: string;
  user?: string;
  // Pool connections nest the real config one level deeper.
  connectionConfig?: MysqlConnectionConfig;
}

interface MysqlConnection {
  config?: MysqlConnectionConfig;
}

const _mysqlChannelIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      // `tracingChannel` is unavailable before Node 18.19 so do nothing in that case.
      if (!diagnosticsChannel.tracingChannel) {
        return;
      }

      DEBUG_BUILD && debug.log(`[orchestrion:mysql] subscribing to channel "${CHANNELS.MYSQL_QUERY}"`);

      waitForTracingChannelBinding(() => {
        bindTracingChannelToSpan(
          diagnosticsChannel.tracingChannel<MysqlQueryChannelContext>(CHANNELS.MYSQL_QUERY),
          data => {
            const sql = extractSql(data.arguments[0]);
            const { host, port, database, user } = getConnectionConfig(data.self);
            const portNumber = typeof port === 'string' ? parseInt(port, 10) : port;
            const portIsNumber = typeof portNumber === 'number' && !isNaN(portNumber);

            // Capture the caller's scope while still synchronously inside `connection.query`, for the
            // streamed-query path: mysql emits the `Query` emitter's events from its socket data handler,
            // where the caller's context is lost. `deferSpanEnd` replays this scope onto that emitter.
            data._sentryCallerScope = getCurrentScope();

            return startInactiveSpan({
              name: sql ?? 'mysql.query',
              op: 'db',
              attributes: {
                [ATTR_DB_SYSTEM]: 'mysql',
                [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.db.orchestrion.mysql',
                [ATTR_DB_CONNECTION_STRING]: getJDBCString(host, portIsNumber ? portNumber : undefined, database),
                ...(database ? { [ATTR_DB_NAME]: database } : {}),
                ...(user ? { [ATTR_DB_USER]: user } : {}),
                ...(sql ? { [ATTR_DB_STATEMENT]: sql } : {}),
                ...(host ? { [ATTR_NET_PEER_NAME]: host } : {}),
                ...(portIsNumber ? { [ATTR_NET_PEER_PORT]: portNumber } : {}),
              },
            });
          },
          {
            // mysql's no-callback `query(sql)` returns a streamable `Query` emitter: the channel publishes
            // `end` synchronously (carrying the emitter as `result`), but the query isn't done until the
            // emitter emits `'end'`/`'error'`.
            // Defer ending to those events for that path.
            deferSpanEnd(span, data) {
              const result = data.result;
              if (!result || typeof result !== 'object' || !hasOnMethod(result)) {
                return false;
              }

              // Replay the caller's scope onto the emitter so listeners the user attaches after `query()`
              // returns (and any spans they start) nest under the caller, not a fresh root trace.
              const callerScope = data._sentryCallerScope;
              if (callerScope) {
                bindScopeToEmitter(result, callerScope);
              }

              result.on('error', err => {
                span.setStatus({
                  code: SPAN_STATUS_ERROR,
                  message: err instanceof Error ? err.message : 'unknown_error',
                });
                // `span.end()` is idempotent, so a following `'end'` is a no-op.
                span.end();
              });
              result.on('end', () => span.end());

              return true;
            },
          },
        );
      });
    },
  };
}) satisfies IntegrationFn;

function hasOnMethod(obj: object): obj is { on: (event: string, listener: (arg?: unknown) => void) => unknown } {
  return 'on' in obj && typeof (obj as { on?: unknown }).on === 'function';
}

function extractSql(firstArg: unknown): string | undefined {
  if (typeof firstArg === 'string') {
    return firstArg;
  }
  if (firstArg && typeof firstArg === 'object' && 'sql' in firstArg) {
    const sql = (firstArg as { sql?: unknown }).sql;
    return typeof sql === 'string' ? sql : undefined;
  }
  return undefined;
}

function getConnectionConfig(connection: MysqlConnection | undefined): {
  host?: string;
  port?: number | string;
  database?: string;
  user?: string;
} {
  // Pool connections nest the real config under `.connectionConfig`; single
  // connections expose it directly. Matches `@opentelemetry/instrumentation-mysql`.
  const config = connection?.config?.connectionConfig ?? connection?.config ?? {};
  return {
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
  };
}

function getJDBCString(host: string | undefined, port: number | undefined, database: string | undefined): string {
  let s = `jdbc:mysql://${host || 'localhost'}`;
  if (typeof port === 'number') {
    s += `:${port}`;
  }
  if (database) {
    s += `/${database}`;
  }
  return s;
}

/**
 * EXPERIMENTAL — orchestrion-driven mysql integration.
 *
 * Subscribes to the `orchestrion:mysql:query` diagnostics_channel that the
 * orchestrion code transform injects into `mysql/lib/Connection.js`'s
 * `Connection.prototype.query`. Requires the orchestrion runtime hook or
 * bundler plugin to be active — wire that up via `_experimentalSetupOrchestrion`.
 */
export const mysqlChannelIntegration = defineIntegration(_mysqlChannelIntegration);
