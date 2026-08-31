import type { TracingChannel } from 'node:diagnostics_channel';
import {
  DB_NAMESPACE,
  DB_OPERATION_NAME,
  DB_QUERY_SUMMARY,
  DB_QUERY_TEXT,
  DB_SYSTEM_NAME,
  SENTRY_OP,
  SERVER_ADDRESS,
  SERVER_PORT,
} from '@sentry/conventions/attributes';
import { DB } from '@sentry/conventions/op';
import {
  _INTERNAL_getSqlQuerySummary,
  _INTERNAL_sanitizeSqlQuery,
  getClient,
  hasSpanStreamingEnabled,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  startInactiveSpan,
} from '@sentry/core';
import { bindTracingChannelToSpan } from '../../tracing-channel';

// Channel names published by mysql2 >= 3.20.0 (see mysql2 `lib/tracing.js`).
// Hardcoded so the subscriber does not have to import mysql2 — the channels
// just have to be subscribed to before the user's mysql2 code publishes.
export const MYSQL2_DC_CHANNEL_QUERY = 'mysql2:query';
export const MYSQL2_DC_CHANNEL_EXECUTE = 'mysql2:execute';
export const MYSQL2_DC_CHANNEL_CONNECT = 'mysql2:connect';
export const MYSQL2_DC_CHANNEL_POOL_CONNECT = 'mysql2:pool:connect';

const ORIGIN = 'auto.db.mysql2.diagnostic_channel';
const DB_SYSTEM_NAME_VALUE_MYSQL = 'mysql';

// Leading keyword of a SQL statement (SELECT, INSERT, …) → `db.operation.name`.
const SQL_OPERATION_RE = /^\s*(\w+)/;

/**
 * Shape of the context object mysql2 >= 3.20.0 publishes on its query/execute
 * tracing channels (see mysql2 `lib/base/connection.js`).
 *
 * Node's `traceCallback`/`tracePromise` mutate this same object with
 * `result`/`error` once the operation settles, which `bindTracingChannelToSpan`
 * reads in its lifecycle handlers — hence both are declared optional here.
 *
 * `query` is the SQL statement. On the `query` channel mysql2 has already
 * inlined `values` into it (`Connection.format`), so it carries raw user data;
 * on the `execute` channel it keeps `?` placeholders. Either way we sanitize it
 * before emitting `db.query.text` and never attach `values`.
 */
export interface MySQL2QueryData {
  query?: string;
  values?: unknown;
  database?: string;
  serverAddress?: string;
  /** Absent for unix-socket connections, where `serverAddress` is the socket path. */
  serverPort?: number;
  result?: unknown;
  error?: Error;
}

/**
 * Shape of the context object mysql2 >= 3.20.0 publishes on its
 * `connect`/`pool:connect` channels.
 */
export interface MySQL2ConnectData {
  database?: string;
  serverAddress?: string;
  serverPort?: number;
  user?: string;
  result?: unknown;
  error?: Error;
}

/**
 * Platform-provided factory that creates a native tracing channel for the given name. The
 * subscriber binds the span and its lifecycle onto the channel via `bindTracingChannelToSpan`,
 * which propagates the active span through the runtime's async context.
 *
 * Node passes `node:diagnostics_channel`'s `tracingChannel` directly.
 */
export type MySQL2TracingChannelFactory = <T extends object>(name: string) => TracingChannel<T, T>;

/**
 * Subscribe Sentry span handlers to mysql2's diagnostics-channel events
 * (`mysql2:query`, `:execute`, `:connect`, `:pool:connect`), published by
 * mysql2 >= 3.20.0.
 *
 * On older mysql2 versions the channels are never published to, so the
 * subscribers are inert — there is no double-instrumentation against the
 * vendored OTel patcher, which is gated to `< 3.20.0`.
 */
export function subscribeMysql2DiagnosticChannels(tracingChannel: MySQL2TracingChannelFactory): void {
  setupQueryChannel(tracingChannel, MYSQL2_DC_CHANNEL_QUERY);
  setupQueryChannel(tracingChannel, MYSQL2_DC_CHANNEL_EXECUTE);
  setupConnectChannel(tracingChannel, MYSQL2_DC_CHANNEL_CONNECT, 'mysql2.connect');
  setupConnectChannel(tracingChannel, MYSQL2_DC_CHANNEL_POOL_CONNECT, 'mysql2.pool.connect');
}

function setupQueryChannel(tracingChannel: MySQL2TracingChannelFactory, channelName: string): void {
  bindTracingChannelToSpan(
    tracingChannel<MySQL2QueryData>(channelName),
    data => {
      // mysql2 does not sanitize its channel payload, so the statement may carry
      // raw user values (on the `query` channel they are inlined). Strip every
      // literal before it leaves the process; `values` is never attached.
      const queryText = data.query ? _INTERNAL_sanitizeSqlQuery(data.query, 'mysql') : undefined;
      const operation = queryText?.match(SQL_OPERATION_RE)?.[1]?.toUpperCase();
      const querySummary = _INTERNAL_getSqlQuerySummary(queryText);

      const client = getClient();
      const name =
        client && hasSpanStreamingEnabled(client)
          ? querySummary || data.database || DB_SYSTEM_NAME_VALUE_MYSQL
          : queryText || 'mysql2.query';

      return startInactiveSpan({
        name,
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
          [SENTRY_OP]: DB,
          [DB_SYSTEM_NAME]: DB_SYSTEM_NAME_VALUE_MYSQL,
          [DB_QUERY_TEXT]: queryText,
          [DB_QUERY_SUMMARY]: querySummary,
          [DB_OPERATION_NAME]: operation,
          [DB_NAMESPACE]: data.database || undefined,
          [SERVER_ADDRESS]: data.serverAddress,
          [SERVER_PORT]: data.serverPort,
        },
      });
    },
    { requiresParentSpan: true },
  );
}

function setupConnectChannel(tracingChannel: MySQL2TracingChannelFactory, channelName: string, spanName: string): void {
  bindTracingChannelToSpan(
    tracingChannel<MySQL2ConnectData>(channelName),
    data => {
      return startInactiveSpan({
        name: spanName,
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
          [SENTRY_OP]: DB,
          [DB_SYSTEM_NAME]: DB_SYSTEM_NAME_VALUE_MYSQL,
          [DB_NAMESPACE]: data.database || undefined,
          [SERVER_ADDRESS]: data.serverAddress,
          [SERVER_PORT]: data.serverPort,
        },
      });
    },
    { requiresParentSpan: true },
  );
}
