import type { TracingChannel } from 'node:diagnostics_channel';
import {
  DB_OPERATION_NAME,
  DB_QUERY_TEXT,
  DB_RESPONSE_STATUS_CODE,
  DB_SYSTEM_NAME,
  SENTRY_KIND,
  SENTRY_OP,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { DB } from '@sentry/conventions/op';
import type { Span, SpanAttributes } from '@sentry/core';
import { debug, getActiveSpan, isObjectLike, startInactiveSpan } from '@sentry/core';
import { DEBUG_BUILD } from '../../debug-build';
import { bindTracingChannelToSpan } from '../../tracing-channel';
import { getSqlQueryAttributes, getSqlSpanName } from '../../utils/sql';
import {
  _getConnectionAttributes,
  _isPostgresJsWrapperSpan,
  type PostgresConnectionContext,
  type PostgresJsSqlInstrumentationOptions,
} from '../postgresjs-wrapper';

/**
 * Tracing channel published by `postgres` >= 4.0.0 for every query (see postgres `src/diagnostics.js`).
 */
export const POSTGRESJS_DC_CHANNEL_QUERY = 'postgres:query';

const ORIGIN = 'auto.db.postgresjs';
const DB_SYSTEM_NAME_POSTGRES = 'postgres';

/**
 * The context `postgres` >= 4.0.0 publishes on `postgres:query`. `host`, `port` and `connection`
 * stay `null` until the query is written to a connection, and `command`/`count` until it completes,
 * so they can only be read once the span ends.
 */
export interface PostgresJsQueryData {
  query?: string | null;
  database?: string;
  user?: string | null;
  host?: string | null;
  port?: number | null;
  command?: string | null;
  result?: unknown;
  error?: unknown;
}

/**
 * Platform-provided factory for a native tracing channel. Node passes `node:diagnostics_channel`'s
 * `tracingChannel` directly.
 */
export type PostgresJsTracingChannelFactory = <T extends object>(name: string) => TracingChannel<T, T>;

/**
 * Subscribe Sentry span handlers to the `postgres:query` tracing channel published natively by
 * `postgres` >= 4.0.0. Older versions never publish it, and the orchestrion transform is gated to
 * `< 4`, so no query gets two spans.
 */
export function subscribePostgresJsDiagnosticChannels(
  tracingChannel: PostgresJsTracingChannelFactory,
  options: PostgresJsSqlInstrumentationOptions = {},
): void {
  const { requireParentSpan, requestHook } = options;

  bindTracingChannelToSpan(
    tracingChannel<PostgresJsQueryData>(POSTGRESJS_DC_CHANNEL_QUERY),
    data => {
      // `instrumentPostgresJsSql` already spans this query, and its span is active when postgres runs it.
      if (_isPostgresJsWrapperSpan(getActiveSpan())) {
        return undefined;
      }

      const queryAttributes = getSqlQueryAttributes(data.query ?? undefined);
      const sanitizedSqlQuery = queryAttributes[DB_QUERY_TEXT] ?? '';
      const connectionContext = getPostgresJsConnectionContext(data);

      const attributes: SpanAttributes = {
        [SENTRY_OP]: DB,
        [SENTRY_KIND]: 'client',
        [SENTRY_ORIGIN]: ORIGIN,
        [DB_SYSTEM_NAME]: DB_SYSTEM_NAME_POSTGRES,
        ...queryAttributes,
        ..._getConnectionAttributes(connectionContext),
      };
      const span = startInactiveSpan({
        name: getSqlSpanName(attributes, 'postgresjs.query'),
        onlyIfParent: requireParentSpan !== false,
        attributes,
      });

      if (requestHook) {
        callRequestHook(requestHook, span, sanitizedSqlQuery, connectionContext);
      }

      return span;
    },
    {
      beforeSpanEnd(span, data) {
        span.setAttributes(getPostgresJsQueryEndAttributes(data));
      },
    },
  );
}

/**
 * Maps a `postgres:query` context to a {@link PostgresConnectionContext}. At `start` only the
 * database is known; `host`/`port` are filled in once the query is sent.
 *
 * @internal Exported for testing only
 */
export function getPostgresJsConnectionContext(data: PostgresJsQueryData): PostgresConnectionContext {
  return {
    ATTR_DB_NAMESPACE: data.database || undefined,
    ATTR_SERVER_ADDRESS: data.host || undefined,
    ATTR_SERVER_PORT: typeof data.port === 'number' ? String(data.port) : undefined,
  };
}

/**
 * Attributes only known once the query settled: the connection it ran on, the server-reported
 * command and, on failure, the Postgres error code.
 *
 * @internal Exported for testing only
 */
export function getPostgresJsQueryEndAttributes(data: PostgresJsQueryData): SpanAttributes {
  const attributes = _getConnectionAttributes(getPostgresJsConnectionContext(data));

  if (data.command) {
    attributes[DB_OPERATION_NAME] = data.command;
  }

  if ('error' in data) {
    const code = isObjectLike(data.error) && 'code' in data.error ? data.error.code : undefined;
    attributes[DB_RESPONSE_STATUS_CODE] = typeof code === 'string' && code ? code : 'unknown';
  }

  return attributes;
}

function callRequestHook(
  requestHook: NonNullable<PostgresJsSqlInstrumentationOptions['requestHook']>,
  span: Span,
  sanitizedSqlQuery: string,
  connectionContext: PostgresConnectionContext,
): void {
  try {
    requestHook(span, sanitizedSqlQuery, connectionContext);
  } catch (e) {
    span.setAttribute('sentry.hook.error', 'requestHook failed');
    DEBUG_BUILD && debug.error('[instrumentation:postgresjs] error in requestHook:', e);
  }
}
