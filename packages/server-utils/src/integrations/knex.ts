// The `@sentry/conventions` db/net attribute keys are deprecated (superseded by newer semconv), but we
// emit them deliberately to preserve parity with what `@opentelemetry/instrumentation-knex` produced.
/* oxlint-disable typescript/no-deprecated */

import * as diagnosticsChannel from 'node:diagnostics_channel';
import type { IntegrationFn, Span, SpanAttributes } from '@sentry/core';
import {
  _INTERNAL_getSqlQuerySummary,
  _INTERNAL_sanitizeSqlQuery,
  debug,
  defineIntegration,
  getActiveSpan,
  getClient,
  hasSpanStreamingEnabled,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SPAN_STATUS_ERROR,
  startInactiveSpan,
  truncate,
  waitForTracingChannelBinding,
} from '@sentry/core';
import {
  DB_NAMESPACE,
  DB_OPERATION_NAME,
  DB_QUERY_SUMMARY,
  DB_QUERY_TEXT,
  DB_SYSTEM_NAME,
  DB_USER,
  NETWORK_TRANSPORT,
  SENTRY_KIND,
  SENTRY_OP,
  SERVER_ADDRESS,
  SERVER_PORT,
} from '@sentry/conventions/attributes';
import { DB } from '@sentry/conventions/op';
import { DEBUG_BUILD } from '../debug-build';
import { CHANNELS } from '../orchestrion/channels';
import { bindTracingChannelToSpan } from '../tracing-channel';

// NOTE: this uses the same name as the OTel integration by design. `@sentry/node`'s `knexIntegration`
// picks this subscriber over the vendored OTel path when orchestrion injection is active.
const INTEGRATION_NAME = 'Knex' as const;
const ORIGIN = 'auto.db.knex';

// Max length of the query text captured in `db.query.text`; "..." is appended when truncated, so the
// truncated statement caps at 1024 chars (1 KiB), matching `@opentelemetry/instrumentation-knex`.
const MAX_QUERY_LENGTH = 1021;

// `db.sql.table` is deprecated and not exported by `@sentry/conventions`, so keep it local. Matches
// what `@opentelemetry/instrumentation-knex` emitted.
const ATTR_DB_SQL_TABLE = 'db.sql.table';

const DB_SYSTEM_SQLITE = 'sqlite';
const DB_SYSTEM_POSTGRESQL = 'postgresql';

// The span active when a builder is created, reused as the parent when the query runs later (the query
// often executes in a different async context than the builder was created in).
const parentSpanSymbol = Symbol('sentry.orchestrion.knex.parent-span');

interface KnexQuery {
  sql?: string;
  method?: string;
  bindings?: unknown[];
}

interface KnexConnectionConfig {
  filename?: string;
  database?: string;
  user?: string;
  host?: string;
  port?: number;
  connectionString?: string;
}

interface KnexBuilder {
  _single?: { table?: unknown };
  toString?: () => string;
  [parentSpanSymbol]?: Span;
}

interface KnexClient {
  driverName?: string;
  config?: { connection?: KnexConnectionConfig };
  _formatQuery?: (sql: string, bindings: unknown[]) => string;
  SqlString?: { format: (sql: string, bindings: unknown[]) => string };
}

interface KnexRunner {
  client?: KnexClient;
  builder?: KnexBuilder;
}

/** Context orchestrion attaches to the `orchestrion:knex:query` channel (wrapping `Runner.query`). */
interface KnexQueryChannelContext {
  // `arguments[0]` is the query object (`{ sql, method, bindings }`).
  arguments: [KnexQuery?];
  self?: KnexRunner;
  moduleVersion?: string;
  result?: unknown;
  error?: unknown;
}

/** Context orchestrion attaches to the `Client.queryBuilder`/`schemaBuilder`/`raw` channels. */
interface KnexBuilderChannelContext {
  arguments: unknown[];
  self?: unknown;
  // The builder returned by the wrapped method.
  result?: KnexBuilder;
}

const _knexIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      // `tracingChannel` is unavailable before Node 18.19 so do nothing in that case.
      if (!diagnosticsChannel.tracingChannel) {
        return;
      }

      DEBUG_BUILD && debug.log(`[instrumentation:knex] subscribing to channel "${CHANNELS.KNEX_QUERY}"`);

      waitForTracingChannelBinding(() => {
        subscribeBuilder(CHANNELS.KNEX_QUERY_BUILDER);
        subscribeBuilder(CHANNELS.KNEX_SCHEMA_BUILDER);
        subscribeBuilder(CHANNELS.KNEX_RAW);
        subscribeQuery();
      });
    },
  };
}) satisfies IntegrationFn;

/**
 * Bookkeeping only: stash the span active at builder-creation time onto the returned builder. It is
 * read back as the parent when the query runs (see `subscribeQuery`), because the query often executes
 * in a different async context. A `Client` builder method is synchronous, so its `result` (the builder)
 * is available on the channel's `end`.
 */
function subscribeBuilder(channelName: string): void {
  diagnosticsChannel.tracingChannel(channelName).end.subscribe(message => {
    const builder = (message as KnexBuilderChannelContext).result;
    if (!builder || typeof builder !== 'object' || parentSpanSymbol in builder) {
      return;
    }

    const activeSpan = getActiveSpan();
    if (!activeSpan) {
      return;
    }

    Object.defineProperty(builder, parentSpanSymbol, { value: activeSpan });
  });
}

function subscribeQuery(): void {
  bindTracingChannelToSpan<KnexQueryChannelContext>(
    diagnosticsChannel.tracingChannel<KnexQueryChannelContext>(CHANNELS.KNEX_QUERY),
    // oxlint-disable-next-line complexity
    data => {
      const runner = data.self;
      const builder = runner?.builder;

      // The builder captures the span active when it was created (see `subscribeBuilder`).
      // `onlyIfParent`: only instrument queries that run as part of an existing trace, matching OTel.
      const parentSpan = builder?.[parentSpanSymbol] ?? getActiveSpan();
      if (!parentSpan) {
        return undefined;
      }

      const query = data.arguments[0];
      const client = runner?.client;
      const connection = client?.config?.connection;
      const connectionString = connection?.connectionString;
      const table = extractTableName(builder);
      const operation = query?.method;
      const dbNameSpace =
        connection?.filename || connection?.database || extractDatabaseFromConnectionString(connectionString);
      const dbSystem = mapSystem(client?.driverName);

      const dbStatement = query?.sql != null ? truncate(query.sql, MAX_QUERY_LENGTH) : undefined;
      const dialect = client?.driverName === 'mysql' || client?.driverName === 'mysql2' ? 'mysql' : undefined;
      const querySummary = dbStatement
        ? _INTERNAL_getSqlQuerySummary(_INTERNAL_sanitizeSqlQuery(dbStatement, dialect))
        : undefined;
      const attributes: SpanAttributes = {
        [SENTRY_OP]: DB,
        [SENTRY_KIND]: 'client',
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
        'knex.version': data.moduleVersion,
        [DB_SYSTEM_NAME]: dbSystem,
        [ATTR_DB_SQL_TABLE]: table,
        [DB_OPERATION_NAME]: operation,
        [DB_USER]: connection?.user,
        [DB_NAMESPACE]: dbNameSpace,
        [SERVER_ADDRESS]: connection?.host ?? extractHostFromConnectionString(connectionString),
        [SERVER_PORT]: connection?.port ?? extractPortFromConnectionString(connectionString),
        [NETWORK_TRANSPORT]: connection?.filename === ':memory:' ? 'inproc' : undefined,
        [DB_QUERY_TEXT]: dbStatement,
        [DB_QUERY_SUMMARY]: querySummary,
      };

      const sentryClient = getClient();
      const spanName =
        sentryClient && hasSpanStreamingEnabled(sentryClient)
          ? querySummary || getSecondaryStreamName(dbSystem, dbNameSpace, operation, table)
          : (dbStatement ?? getName(dbNameSpace, operation, table) ?? 'knex.query');

      return startInactiveSpan({
        name: spanName,
        parentSpan,
        attributes,
      });
    },
    {
      beforeSpanEnd(span, data) {
        // knex prefixes query errors with the full SQL ("<query> - <error>"). Strip it so the span
        // status message is just the driver error, matching the vendored OTel instrumentation.
        if ('error' in data) {
          const message = cleanErrorMessage(data);
          if (message !== undefined) {
            span.setStatus({ code: SPAN_STATUS_ERROR, message });
          }
        }
      },
    },
  );
}

function cleanErrorMessage(data: KnexQueryChannelContext): string | undefined {
  const error = data.error;
  if (!error || typeof error !== 'object' || typeof (error as { message?: unknown }).message !== 'string') {
    return undefined;
  }

  const rawMessage = (error as { message: string }).message;
  const query = data.arguments[0];
  if (!query?.sql) {
    return rawMessage;
  }

  try {
    const formatter = getFormatter(data.self);
    const fullQuery = formatter(query.sql, query.bindings || []);
    return rawMessage.replace(`${fullQuery} - `, '');
  } catch {
    return rawMessage;
  }
}

function getFormatter(runner: KnexRunner | undefined): (sql: string, bindings: unknown[]) => string {
  if (runner) {
    const client = runner.client;
    if (client) {
      if (client._formatQuery) {
        return client._formatQuery.bind(client);
      } else if (client.SqlString) {
        return client.SqlString.format.bind(client.SqlString);
      }
    }
    if (runner.builder?.toString) {
      return runner.builder.toString.bind(runner.builder);
    }
  }

  return () => '<noop formatter>';
}

function mapSystem(driverName: string | undefined): string | undefined {
  if (driverName === 'sqlite3') {
    return DB_SYSTEM_SQLITE;
  }
  if (driverName === 'pg') {
    return DB_SYSTEM_POSTGRESQL;
  }
  return driverName;
}

function getName(db: string | undefined, operation?: string, table?: string): string | undefined {
  // `db` can be undefined when the database can't be determined from the knex config. Guard against
  // interpolating it (which would emit the literal "undefined") and let the call site fall back.
  if (operation && db) {
    return table ? `${operation} ${db}.${table}` : `${operation} ${db}`;
  }
  return db;
}

function getSecondaryStreamName(
  dbSystem: string | undefined,
  dbNameSpace: string | undefined,
  operation?: string,
  table?: string,
): string {
  if (operation) {
    if (table) {
      return `${operation} ${table}`;
    }
    if (dbNameSpace) {
      return `${operation} ${dbNameSpace}`;
    }
  }
  if (table) {
    return table;
  }
  if (dbNameSpace) {
    return dbNameSpace;
  }
  // Mirrors the postgres integration, which falls back to `{db.system.name}` rather than to a static
  // name. `db.system.name` is only unset when the knex client reports no driver.
  return dbSystem ?? 'knex.query';
}

function extractTableName(builder: KnexBuilder | undefined): string | undefined {
  const table = builder?._single?.table;
  if (table && typeof table === 'object') {
    return extractTableName(table);
  }
  return typeof table === 'string' ? table : undefined;
}

function extractDatabaseFromConnectionString(connectionString: string | undefined): string | undefined {
  if (!connectionString) {
    return undefined;
  }
  try {
    const db = new URL(connectionString).pathname?.replace(/^\//, '');
    return db || undefined;
  } catch {
    return undefined;
  }
}

function extractHostFromConnectionString(connectionString: string | undefined): string | undefined {
  if (!connectionString) {
    return undefined;
  }
  try {
    return new URL(connectionString).hostname || undefined;
  } catch {
    return undefined;
  }
}

function extractPortFromConnectionString(connectionString: string | undefined): number | undefined {
  if (!connectionString) {
    return undefined;
  }
  try {
    const port = new URL(connectionString).port;
    return port ? parseInt(port, 10) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Diagnostics-channel-based knex integration.
 *
 * Subscribes to the `orchestrion:knex:*` diagnostics_channels that Sentry's code transform
 * injects into knex's `Runner.query` (span) and `Client.queryBuilder`/`schemaBuilder`/`raw` (parent-span
 * bookkeeping). Requires the Sentry runtime hook or bundler plugin to be active.
 */
export const knexIntegration = defineIntegration(_knexIntegration);
