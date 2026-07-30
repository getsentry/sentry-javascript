// The `@sentry/conventions` db/net attribute keys are deprecated (superseded by newer semconv), but we
// emit them deliberately to preserve parity with what `@opentelemetry/instrumentation-tedious` produced.
/* oxlint-disable typescript/no-deprecated */

import { EventEmitter } from 'node:events';
import * as diagnosticsChannel from 'node:diagnostics_channel';
import type { IntegrationFn, SpanAttributes } from '@sentry/core';
import {
  debug,
  defineIntegration,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SPAN_STATUS_ERROR,
  startInactiveSpan,
  waitForTracingChannelBinding,
} from '@sentry/core';
import {
  DB_NAME,
  DB_STATEMENT,
  DB_SYSTEM,
  DB_USER,
  NET_PEER_NAME,
  NET_PEER_PORT,
  SENTRY_KIND,
} from '@sentry/conventions/attributes';
import { DEBUG_BUILD } from '../../debug-build';
import { CHANNELS } from '../../orchestrion/channels';

// NOTE: this uses the same name as the OTel integration by design. When orchestrion injection is active,
// `_init` swaps the OTel `Tedious` integration out of the defaults and appends this one (matched by name).
const INTEGRATION_NAME = 'Tedious' as const;
const ORIGIN = 'auto.db.tedious';

// OTel db/net semantic-convention values/keys not exported by `@sentry/conventions`, inlined to match
// what `@opentelemetry/instrumentation-tedious` emitted.
const DB_SYSTEM_VALUE_MSSQL = 'mssql';
const ATTR_DB_SQL_TABLE = 'db.sql.table';

// Tracks the connection's active database (updated on `databaseChange`), read into `db.name` when a query
// runs. Mirrors the `CURRENT_DATABASE` symbol the vendored OTel instrumentation stashed on the connection.
const currentDatabaseSymbol = Symbol('sentry.orchestrion.tedious.current-database');

type UnknownFunction = (...args: unknown[]) => unknown;

interface TediousConnectionConfig {
  server?: string;
  userName?: string;
  authentication?: { options?: { userName?: string } };
  options?: { database?: string; port?: number };
}

interface TediousConnection extends EventEmitter {
  config?: TediousConnectionConfig;
  [currentDatabaseSymbol]?: string;
}

interface TediousRequest extends EventEmitter {
  sqlTextOrProcedure?: string;
  callback?: UnknownFunction;
  table?: string;
  parametersByName?: Record<string, { value?: unknown } | undefined>;
}

/** Context orchestrion attaches to the query channels (wrapping the `Connection` request methods). */
interface TediousQueryChannelContext {
  // `arguments[0]` is the `Request` (or `BulkLoad` for `execBulkLoad`), both `EventEmitter`s.
  arguments: [TediousRequest?, ...unknown[]];
  self?: TediousConnection;
  moduleVersion?: string;
}

/** Context orchestrion attaches to the `Connection.connect` channel. */
interface TediousConnectChannelContext {
  arguments: unknown[];
  self?: TediousConnection;
}

// Used both to seed the initial database and as the `databaseChange` listener, where `this` is the
// connection (a non-arrow listener). Keeping one shared reference lets `removeListener` find it again.
function setDatabase(this: TediousConnection, databaseName: string | undefined): void {
  Object.defineProperty(this, currentDatabaseSymbol, { value: databaseName, writable: true, configurable: true });
}

// The `end` cleanup listener, where `this` is the connection (a non-arrow listener). Named (like
// `setDatabase`) so repeated `connect` calls can `removeListener` it rather than accumulate anonymous ones.
function removeDatabaseListener(this: TediousConnection): void {
  this.removeListener('databaseChange', setDatabase);
}

function subscribeConnect(): void {
  diagnosticsChannel.tracingChannel(CHANNELS.TEDIOUS_CONNECT).start.subscribe(message => {
    const connection = (message as TediousConnectChannelContext).self;
    if (!connection) {
      return;
    }

    setDatabase.call(connection, connection.config?.options?.database);

    // Remove first in case `connect` runs more than once on the same connection, so neither listener
    // accumulates across reconnects.
    connection.removeListener('databaseChange', setDatabase);
    connection.on('databaseChange', setDatabase);
    connection.removeListener('end', removeDatabaseListener);
    connection.once('end', removeDatabaseListener);
  });
}

function subscribeQuery(channelName: string, operation: string): void {
  diagnosticsChannel.tracingChannel(channelName).start.subscribe(message => {
    const data = message as TediousQueryChannelContext;
    const connection = data.self;
    const request = data.arguments[0];

    // The vendored instrumentation only traced when the first argument is an `EventEmitter` (a `Request`
    // or `BulkLoad`); anything else is left untouched.
    if (!connection || !(request instanceof EventEmitter)) {
      return;
    }

    let procCount = 0;
    let statementCount = 0;
    const incrementStatementCount = (): void => {
      statementCount++;
    };
    const incrementProcCount = (): void => {
      procCount++;
    };

    const databaseName = connection[currentDatabaseSymbol];
    const sql = extractSql(request);

    const attributes: SpanAttributes = {
      [SENTRY_KIND]: 'client',
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
      [DB_SYSTEM]: DB_SYSTEM_VALUE_MSSQL,
      [DB_NAME]: databaseName,
      // `>=4` uses the `authentication` object; older versions expose `userName` directly.
      [DB_USER]: connection.config?.userName ?? connection.config?.authentication?.options?.userName,
      [DB_STATEMENT]: sql,
      [ATTR_DB_SQL_TABLE]: request.table,
      [NET_PEER_NAME]: connection.config?.server,
      [NET_PEER_PORT]: connection.config?.options?.port,
    };

    const span = startInactiveSpan({
      name: sql || getSpanName(operation, databaseName, sql, request.table),
      op: 'db',
      attributes,
    });

    const endSpan = once((err?: { message?: string }): void => {
      request.removeListener('done', incrementStatementCount);
      request.removeListener('doneInProc', incrementStatementCount);
      request.removeListener('doneProc', incrementProcCount);
      request.removeListener('error', endSpan);
      connection.removeListener('end', endSpan);

      span.setAttribute('tedious.procedure_count', procCount);
      span.setAttribute('tedious.statement_count', statementCount);
      if (err) {
        span.setStatus({ code: SPAN_STATUS_ERROR, message: err.message });
      }

      span.end();
    });

    request.on('done', incrementStatementCount);
    request.on('doneInProc', incrementStatementCount);
    request.on('doneProc', incrementProcCount);
    request.once('error', endSpan);
    connection.on('end', endSpan);

    // tedious invokes `request.callback` when the request settles (passing the error, if any). Wrapping it
    // here (at `start`, before the method body dispatches) is the completion signal. A failed non-preparing
    // request reports its error only through this callback, not via an `'error'` event.
    if (typeof request.callback === 'function') {
      const originalCallback = request.callback;
      request.callback = function (this: unknown, ...args: unknown[]): unknown {
        endSpan(args[0] as { message?: string } | undefined);

        return originalCallback.apply(this, args);
      };
    }
  });
}

function extractSql(request: TediousRequest): string | undefined {
  // Required for <11.0.9: the SQL for a prepared statement is carried in the `stmt` parameter.
  if (request.sqlTextOrProcedure === 'sp_prepare' && request.parametersByName?.stmt?.value != null) {
    const value = request.parametersByName.stmt.value;

    return typeof value === 'string' ? value : undefined;
  }

  return request.sqlTextOrProcedure;
}

/**
 * The span name is a low-cardinality label for the operation; the SDK's db-span inference later renames
 * the span description off `db.statement` when present. Mirrors the vendored OTel `getSpanName`.
 */
function getSpanName(
  operation: string,
  db: string | undefined,
  sql: string | undefined,
  bulkLoadTable: string | undefined,
): string {
  if (operation === 'execBulkLoad' && bulkLoadTable && db) {
    return `${operation} ${bulkLoadTable} ${db}`;
  }
  if (operation === 'callProcedure') {
    // `sql` refers to the procedure name for `callProcedure`.
    return db ? `${operation} ${sql} ${db}` : `${operation} ${sql}`;
  }
  // Avoid `sql` in the general case because of its high cardinality.
  return db ? `${operation} ${db}` : operation;
}

function once<Args extends unknown[]>(fn: (...args: Args) => void): (...args: Args) => void {
  let called = false;

  return (...args: Args): void => {
    if (called) {
      return;
    }
    called = true;
    fn(...args);
  };
}

const _tediousIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      // `tracingChannel` is unavailable before Node 18.19 so do nothing in that case.
      if (!diagnosticsChannel.tracingChannel) {
        return;
      }

      DEBUG_BUILD && debug.log(`[orchestrion:tedious] subscribing to channel "${CHANNELS.TEDIOUS_EXEC_SQL}"`);

      waitForTracingChannelBinding(() => {
        subscribeConnect();
        subscribeQuery(CHANNELS.TEDIOUS_EXEC_SQL, 'execSql');
        subscribeQuery(CHANNELS.TEDIOUS_EXEC_SQL_BATCH, 'execSqlBatch');
        subscribeQuery(CHANNELS.TEDIOUS_CALL_PROCEDURE, 'callProcedure');
        subscribeQuery(CHANNELS.TEDIOUS_EXEC_BULK_LOAD, 'execBulkLoad');
        subscribeQuery(CHANNELS.TEDIOUS_PREPARE, 'prepare');
        subscribeQuery(CHANNELS.TEDIOUS_EXECUTE, 'execute');
      });
    },
  };
}) satisfies IntegrationFn;

/**
 * Orchestrion-driven tedious integration.
 *
 * Subscribes to the `orchestrion:tedious:*` diagnostics_channels that the orchestrion code transform
 * injects into tedious's `Connection` request methods (each traced as one db span) and `Connection.connect`
 * (active-database bookkeeping). Requires the orchestrion runtime hook or bundler plugin to be active.
 */
export const tediousIntegration = defineIntegration(_tediousIntegration);
