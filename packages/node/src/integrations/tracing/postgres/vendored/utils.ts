/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-pg
 * - Upstream version: @opentelemetry/instrumentation-pg@0.70.0
 * - Types from `pg` package inlined as simplified interfaces
 * - Refactored to use Sentry's span APIs instead of OpenTelemetry tracing APIs
 */

import { SpanKind } from '@opentelemetry/api';
import type { Span, SpanAttributes } from '@sentry/core';
import { getActiveSpan, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, SPAN_STATUS_ERROR, startInactiveSpan } from '@sentry/core';
import { AttributeNames } from './enums/AttributeNames';
import { SpanNames } from './enums/SpanNames';
import type {
  PgClientExtended,
  PgParsedConnectionParams,
  PgPoolCallback,
  PgPoolExtended,
  PgPoolOptionsParams,
  PostgresCallback,
} from './internal-types';
import type { PgClient } from './pg-types';
import {
  ATTR_DB_CONNECTION_STRING,
  ATTR_DB_NAME,
  ATTR_DB_STATEMENT,
  ATTR_DB_SYSTEM,
  ATTR_DB_USER,
  ATTR_NET_PEER_NAME,
  ATTR_NET_PEER_PORT,
  DB_SYSTEM_VALUE_POSTGRESQL,
} from './semconv';

export const ORIGIN = 'auto.db.otel.postgres';

/**
 * Helper function to get a low cardinality span name from whatever info we have
 * about the query.
 *
 * This is tricky, because we don't have most of the information (table name,
 * operation name, etc) the spec recommends using to build a low-cardinality
 * value w/o parsing. So, we use db.name and assume that, if the query's a named
 * prepared statement, those `name` values will be low cardinality. If we don't
 * have a named prepared statement, we try to parse an operation (despite the
 * spec's warnings).
 *
 * @params dbName The name of the db against which this query is being issued,
 *   which could be missing if no db name was given at the time that the
 *   connection was established.
 * @params queryConfig Information we have about the query being issued, typed
 *   to reflect only the validation we've actually done on the args to
 *   `client.query()`. This will be undefined if `client.query()` was called
 *   with invalid arguments.
 */
export function getQuerySpanName(dbName: string | undefined, queryConfig?: { text: string; name?: unknown }): string {
  // NB: when the query config is invalid, we omit the dbName too, so that
  // someone (or some tool) reading the span name doesn't misinterpret the
  // dbName as being a prepared statement or sql commit name.
  if (!queryConfig) return SpanNames.QUERY_PREFIX;

  // Either the name of a prepared statement; or an attempted parse
  // of the SQL command, normalized to uppercase; or unknown.
  const command =
    typeof queryConfig.name === 'string' && queryConfig.name
      ? queryConfig.name
      : parseNormalizedOperationName(queryConfig.text);

  return `${SpanNames.QUERY_PREFIX}:${command}${dbName ? ` ${dbName}` : ''}`;
}

export function parseNormalizedOperationName(queryText: string): string {
  // Trim the query text to handle leading/trailing whitespace
  const trimmedQuery = queryText.trim();
  const indexOfFirstSpace = trimmedQuery.indexOf(' ');
  let sqlCommand = indexOfFirstSpace === -1 ? trimmedQuery : trimmedQuery.slice(0, indexOfFirstSpace);
  sqlCommand = sqlCommand.toUpperCase();

  // Handle query text being "COMMIT;", which has an extra semicolon before the space.
  return sqlCommand.endsWith(';') ? sqlCommand.slice(0, -1) : sqlCommand;
}

export function parseAndMaskConnectionString(connectionString: string): string {
  try {
    // Parse the connection string
    const url = new URL(connectionString);

    // Remove all auth information (username and password)
    url.username = '';
    url.password = '';

    return url.toString();
  } catch {
    // If parsing fails, return a generic connection string
    return 'postgresql://localhost:5432/';
  }
}

export function getConnectionString(params: PgParsedConnectionParams | PgPoolOptionsParams): string {
  if ('connectionString' in params && params.connectionString) {
    return parseAndMaskConnectionString(params.connectionString);
  }
  const host = params.host || 'localhost';
  const port = params.port || 5432;
  const database = params.database || '';
  return `postgresql://${host}:${port}/${database}`;
}

function getPort(port: number | undefined): number | undefined {
  // Port may be NaN as parseInt() is used on the value, passing null will result in NaN being parsed.
  // https://github.com/brianc/node-postgres/blob/2a8efbee09a284be12748ed3962bc9b816965e36/packages/pg/lib/connection-parameters.js#L66
  if (Number.isInteger(port)) {
    return port;
  }

  // Unable to find the default used in pg code, so falling back to 'undefined'.
  return undefined;
}

export function getSemanticAttributesFromConnection(params: PgParsedConnectionParams): SpanAttributes {
  return {
    [ATTR_DB_SYSTEM]: DB_SYSTEM_VALUE_POSTGRESQL,
    [ATTR_DB_NAME]: params.database,
    [ATTR_DB_CONNECTION_STRING]: getConnectionString(params),
    [ATTR_DB_USER]: params.user,
    [ATTR_NET_PEER_NAME]: params.host, // required
    [ATTR_NET_PEER_PORT]: getPort(params.port),
  };
}

export function getSemanticAttributesFromPoolConnection(params: PgPoolOptionsParams): SpanAttributes {
  let url: URL | undefined;
  try {
    url = params.connectionString ? new URL(params.connectionString) : undefined;
  } catch {
    url = undefined;
  }

  return {
    [AttributeNames.IDLE_TIMEOUT_MILLIS]: params.idleTimeoutMillis,
    [AttributeNames.MAX_CLIENT]: params.maxClient,
    [ATTR_DB_SYSTEM]: DB_SYSTEM_VALUE_POSTGRESQL,
    [ATTR_DB_NAME]: url?.pathname.slice(1) ?? params.database,
    [ATTR_DB_CONNECTION_STRING]: getConnectionString(params),
    [ATTR_NET_PEER_NAME]: url?.hostname ?? params.host,
    [ATTR_NET_PEER_PORT]: Number(url?.port) || getPort(params.port),
    [ATTR_DB_USER]: url?.username ?? params.user,
  };
}

/**
 * The SDK always requires a parent span (it sets `requireParentSpan: true`), so
 * we only instrument when there is an active span to parent the new span under.
 */
export function shouldSkipInstrumentation(): boolean {
  return getActiveSpan() === undefined;
}

// Create an (inactive) span from our normalized queryConfig object,
// or return a basic span if no queryConfig was given/could be created.
export function handleConfigQuery(
  this: PgClientExtended,
  queryConfig?: { text: string; values?: unknown; name?: unknown },
): Span {
  // Create child span.
  const { connectionParameters } = this;
  const dbName = connectionParameters.database;

  const spanName = getQuerySpanName(dbName, queryConfig);
  const span = startInactiveSpan({
    name: spanName,
    kind: SpanKind.CLIENT,
    attributes: {
      ...getSemanticAttributesFromConnection(connectionParameters),
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
    },
  });

  if (!queryConfig) {
    return span;
  }

  // Set attributes
  if (queryConfig.text) {
    span.setAttribute(ATTR_DB_STATEMENT, queryConfig.text);
  }

  // Set plan name attribute, if present
  if (typeof queryConfig.name === 'string') {
    span.setAttribute(AttributeNames.PG_PLAN, queryConfig.name);
  }

  return span;
}

export function patchCallback(span: Span, cb: PostgresCallback): PostgresCallback {
  return function patchedCallback(this: PgClientExtended, err: Error, res: object) {
    if (err) {
      span.setStatus({ code: SPAN_STATUS_ERROR, message: err.message });
    }
    span.end();
    cb.call(this, err, res);
  };
}

export function patchCallbackPGPool(span: Span, cb: PgPoolCallback): PgPoolCallback {
  return function patchedCallback(this: PgPoolExtended, err: Error, res: object, done: any) {
    if (err) {
      span.setStatus({ code: SPAN_STATUS_ERROR, message: err.message });
    }
    span.end();
    cb.call(this, err, res, done);
  };
}

export function patchClientConnectCallback(span: Span, cb: (...args: unknown[]) => void): (...args: unknown[]) => void {
  return function patchedClientConnectCallback(this: PgClient, ...args: unknown[]) {
    const err = args[0];
    if (err instanceof Error) {
      span.setStatus({ code: SPAN_STATUS_ERROR, message: err.message });
    }
    span.end();
    cb.apply(this, args);
  };
}

/**
 * Attempt to get a message string from a thrown value, while being quite
 * defensive, to recognize the fact that, in JS, any kind of value (even
 * primitives) can be thrown.
 */
export function getErrorMessage(e: unknown): string | undefined {
  return typeof e === 'object' && e !== null && 'message' in e
    ? String((e as { message?: unknown }).message)
    : undefined;
}

export function isObjectWithTextString(it: unknown): it is ObjectWithText {
  return typeof it === 'object' && typeof (it as null | { text?: unknown })?.text === 'string';
}

export type ObjectWithText = {
  text: string;
  [k: string]: unknown;
};
