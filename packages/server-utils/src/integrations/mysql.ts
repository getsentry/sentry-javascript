import * as diagnosticsChannel from 'node:diagnostics_channel';
import {
  DB_NAMESPACE,
  DB_QUERY_SUMMARY,
  DB_QUERY_TEXT,
  DB_SYSTEM_NAME,
  DB_USER,
  SENTRY_KIND,
  SENTRY_OP,
  SERVER_ADDRESS,
  SERVER_PORT,
} from '@sentry/conventions/attributes';
import { DB } from '@sentry/conventions/op';
import type { IntegrationFn, Scope } from '@sentry/core';
import {
  _INTERNAL_getSqlQuerySummary,
  _INTERNAL_sanitizeSqlQuery,
  isObjectLike,
  bindScopeToEmitter,
  defineIntegration,
  getClient,
  getCurrentScope,
  hasSpanStreamingEnabled,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  startInactiveSpan,
} from '@sentry/core';
import { CHANNELS } from '../orchestrion/channels';
import { bindTracingChannelToSpan } from '../tracing-channel';
import { mysqlModuleNames } from '../orchestrion/config/mysql';
import { invokeOrchestrionInstrumentation } from '../orchestrion/instrumentation';

// NOTE: this uses the same name as the OTel integration by design.
// When enabled, OTel 'Mysql' integration is omitted from the default set.
const INTEGRATION_NAME = 'Mysql' as const;

// `db.connection_string` is not part of `@sentry/conventions`, so it stays inlined. Matches
// `@opentelemetry/instrumentation-mysql`'s default shape.
const ATTR_DB_CONNECTION_STRING = 'db.connection_string';

const DB_SYSTEM_NAME_VALUE_MYSQL = 'mysql' as const;

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

const _mysqlIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      invokeOrchestrionInstrumentation(client, mysqlModuleNames, instrumentMysql, []);
    },
  };
}) satisfies IntegrationFn;

function instrumentMysql(): void {
  bindTracingChannelToSpan(
    diagnosticsChannel.tracingChannel<MysqlQueryChannelContext>(CHANNELS.MYSQL_QUERY),
    data => {
      const sql = extractSql(data.arguments[0]);
      const { host, port, database, user } = getConnectionConfig(data.self);
      const portNumber = typeof port === 'string' ? parseInt(port, 10) : port;
      const portIsNumber = typeof portNumber === 'number' && !isNaN(portNumber);

      // For the streamed path: mysql emits the `Query` emitter's events from its socket data
      // handler with the caller's context lost. `deferSpanEnd` replays this scope onto the emitter.
      data._sentryCallerScope = getCurrentScope();

      const querySummary = sql ? _INTERNAL_getSqlQuerySummary(_INTERNAL_sanitizeSqlQuery(sql, 'mysql')) : undefined;

      const client = getClient();
      const name =
        client && hasSpanStreamingEnabled(client)
          ? querySummary || database || DB_SYSTEM_NAME_VALUE_MYSQL
          : (sql ?? 'mysql.query');

      return startInactiveSpan({
        name,
        attributes: {
          [SENTRY_OP]: DB,
          [SENTRY_KIND]: 'client',
          [DB_SYSTEM_NAME]: DB_SYSTEM_NAME_VALUE_MYSQL,
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.db.mysql',
          [ATTR_DB_CONNECTION_STRING]: getJDBCString(host, portIsNumber ? portNumber : undefined, database),
          ...(database ? { [DB_NAMESPACE]: database } : {}),
          ...(user ? { [DB_USER]: user } : {}),
          ...(sql ? { [DB_QUERY_TEXT]: sql } : {}),
          [DB_QUERY_SUMMARY]: querySummary,
          [SERVER_ADDRESS]: host,
          [SERVER_PORT]: portIsNumber ? portNumber : undefined,
        },
      });
    },
    {
      // No-callback `query(sql)` returns a streamable `Query` emitter as `result`; it settles on the
      // emitter's `'end'`/`'error'`, not the channel, so defer ending to those.
      deferSpanEnd({ data, end }) {
        const result = data.result;
        if (!result || typeof result !== 'object' || !hasOnMethod(result)) {
          return false;
        }

        // Replay the caller's scope so user listeners on the emitter nest under it, not a new trace.
        const callerScope = data._sentryCallerScope;
        if (callerScope) {
          bindScopeToEmitter(result, callerScope);
        }

        result.on('error', err => end(err));
        result.on('end', () => end());

        return true;
      },
    },
  );
}

function hasOnMethod(obj: object): obj is { on: (event: string, listener: (arg?: unknown) => void) => unknown } {
  return 'on' in obj && typeof (obj as { on?: unknown }).on === 'function';
}

function extractSql(firstArg: unknown): string | undefined {
  if (typeof firstArg === 'string') {
    return firstArg;
  }
  if (isObjectLike(firstArg) && 'sql' in firstArg) {
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
 * Diagnostics-channel-based mysql integration.
 *
 * Subscribes to the `orchestrion:mysql:query` diagnostics_channel that
 * Sentry's code transform injects into `mysql/lib/Connection.js`'s
 * `Connection.prototype.query`. Requires the Sentry runtime hook or
 * bundler plugin to be active.
 */
export const mysqlIntegration = defineIntegration(_mysqlIntegration);
