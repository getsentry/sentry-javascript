/*
 * Copyright The OpenTelemetry Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-pg
 * - Upstream version: @opentelemetry/instrumentation-pg@0.70.0
 * - Types from `pg` package inlined as simplified interfaces
 * - Minor TypeScript strictness adjustments
 */
/* eslint-disable */

import {
  context,
  trace,
  Span,
  SpanStatusCode,
  Tracer,
  SpanKind,
  diag,
  UpDownCounter,
  Attributes,
} from '@opentelemetry/api';
import { AttributeNames } from './enums/AttributeNames';
import {
  ATTR_ERROR_TYPE,
  ATTR_DB_SYSTEM_NAME,
  ATTR_DB_NAMESPACE,
  ATTR_SERVER_ADDRESS,
  ATTR_SERVER_PORT,
  ATTR_DB_QUERY_TEXT,
  DB_SYSTEM_NAME_VALUE_POSTGRESQL,
} from '@opentelemetry/semantic-conventions';
import {
  ATTR_DB_CLIENT_CONNECTION_POOL_NAME,
  ATTR_DB_CLIENT_CONNECTION_STATE,
  DB_CLIENT_CONNECTION_STATE_VALUE_USED,
  DB_CLIENT_CONNECTION_STATE_VALUE_IDLE,
  ATTR_DB_SYSTEM,
  ATTR_DB_NAME,
  ATTR_DB_USER,
  DB_SYSTEM_VALUE_POSTGRESQL,
  ATTR_DB_CONNECTION_STRING,
  ATTR_NET_PEER_PORT,
  ATTR_NET_PEER_NAME,
  ATTR_DB_STATEMENT,
} from './semconv';
import {
  PgClientExtended,
  PostgresCallback,
  PgPoolCallback,
  PgPoolExtended,
  PgParsedConnectionParams,
  PgPoolOptionsParams,
} from './internal-types';
import { PgInstrumentationConfig } from './types';
import type { PgClient, QueryResult, QueryArrayResult } from './pg-types';
import { safeExecuteInTheMiddle, SemconvStability } from '@opentelemetry/instrumentation';
import { SpanNames } from './enums/SpanNames';

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
export function getQuerySpanName(dbName: string | undefined, queryConfig?: { text: string; name?: unknown }) {
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

export function parseNormalizedOperationName(queryText: string) {
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
  } catch (e) {
    // If parsing fails, return a generic connection string
    return 'postgresql://localhost:5432/';
  }
}

export function getConnectionString(params: PgParsedConnectionParams | PgPoolOptionsParams) {
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

export function getSemanticAttributesFromConnection(
  params: PgParsedConnectionParams,
  semconvStability: SemconvStability,
) {
  let attributes: Attributes = {};

  if (semconvStability & SemconvStability.OLD) {
    attributes = {
      ...attributes,
      [ATTR_DB_SYSTEM]: DB_SYSTEM_VALUE_POSTGRESQL,
      [ATTR_DB_NAME]: params.database,
      [ATTR_DB_CONNECTION_STRING]: getConnectionString(params),
      [ATTR_DB_USER]: params.user,
      [ATTR_NET_PEER_NAME]: params.host, // required
      [ATTR_NET_PEER_PORT]: getPort(params.port),
    };
  }
  if (semconvStability & SemconvStability.STABLE) {
    attributes = {
      ...attributes,
      [ATTR_DB_SYSTEM_NAME]: DB_SYSTEM_NAME_VALUE_POSTGRESQL,
      [ATTR_DB_NAMESPACE]: params.namespace,
      [ATTR_SERVER_ADDRESS]: params.host,
      [ATTR_SERVER_PORT]: getPort(params.port),
    };
  }

  return attributes;
}

export function getSemanticAttributesFromPoolConnection(
  params: PgPoolOptionsParams,
  semconvStability: SemconvStability,
) {
  let url: URL | undefined;
  try {
    url = params.connectionString ? new URL(params.connectionString) : undefined;
  } catch (e) {
    url = undefined;
  }
  let attributes: Attributes = {
    [AttributeNames.IDLE_TIMEOUT_MILLIS]: params.idleTimeoutMillis,
    [AttributeNames.MAX_CLIENT]: params.maxClient,
  };

  if (semconvStability & SemconvStability.OLD) {
    attributes = {
      ...attributes,
      [ATTR_DB_SYSTEM]: DB_SYSTEM_VALUE_POSTGRESQL,
      [ATTR_DB_NAME]: url?.pathname.slice(1) ?? params.database,
      [ATTR_DB_CONNECTION_STRING]: getConnectionString(params),
      [ATTR_NET_PEER_NAME]: url?.hostname ?? params.host,
      [ATTR_NET_PEER_PORT]: Number(url?.port) || getPort(params.port),
      [ATTR_DB_USER]: url?.username ?? params.user,
    };
  }
  if (semconvStability & SemconvStability.STABLE) {
    attributes = {
      ...attributes,
      [ATTR_DB_SYSTEM_NAME]: DB_SYSTEM_NAME_VALUE_POSTGRESQL,
      [ATTR_DB_NAMESPACE]: params.namespace,
      [ATTR_SERVER_ADDRESS]: url?.hostname ?? params.host,
      [ATTR_SERVER_PORT]: Number(url?.port) || getPort(params.port),
    };
  }

  return attributes;
}

export function shouldSkipInstrumentation(instrumentationConfig: PgInstrumentationConfig) {
  return instrumentationConfig.requireParentSpan === true && trace.getSpan(context.active()) === undefined;
}

// Create a span from our normalized queryConfig object,
// or return a basic span if no queryConfig was given/could be created.
export function handleConfigQuery(
  this: PgClientExtended,
  tracer: Tracer,
  instrumentationConfig: PgInstrumentationConfig,
  semconvStability: SemconvStability,
  queryConfig?: { text: string; values?: unknown; name?: unknown },
) {
  // Create child span.
  const { connectionParameters } = this;
  const dbName = connectionParameters.database;

  const spanName = getQuerySpanName(dbName, queryConfig);
  const span = tracer.startSpan(spanName, {
    kind: SpanKind.CLIENT,
    attributes: getSemanticAttributesFromConnection(connectionParameters, semconvStability),
  });

  if (!queryConfig) {
    return span;
  }

  // Set attributes
  if (queryConfig.text) {
    if (semconvStability & SemconvStability.OLD) {
      span.setAttribute(ATTR_DB_STATEMENT, queryConfig.text);
    }
    if (semconvStability & SemconvStability.STABLE) {
      span.setAttribute(ATTR_DB_QUERY_TEXT, queryConfig.text);
    }
  }

  if (instrumentationConfig.enhancedDatabaseReporting && Array.isArray(queryConfig.values)) {
    try {
      const convertedValues = queryConfig.values.map(value => {
        if (value == null) {
          return 'null';
        } else if (value instanceof Buffer) {
          return value.toString();
        } else if (typeof value === 'object') {
          if (typeof value.toPostgres === 'function') {
            return value.toPostgres();
          }
          return JSON.stringify(value);
        } else {
          //string, number
          return value.toString();
        }
      });
      span.setAttribute(AttributeNames.PG_VALUES, convertedValues);
    } catch (e) {
      diag.error('failed to stringify ', queryConfig.values, e);
    }
  }

  // Set plan name attribute, if present
  if (typeof queryConfig.name === 'string') {
    span.setAttribute(AttributeNames.PG_PLAN, queryConfig.name);
  }

  return span;
}

export function handleExecutionResult(
  config: PgInstrumentationConfig,
  span: Span,
  pgResult: QueryResult | QueryArrayResult | unknown,
) {
  if (typeof config.responseHook === 'function') {
    safeExecuteInTheMiddle(
      () => {
        config.responseHook!(span, {
          data: pgResult as QueryResult | QueryArrayResult,
        });
      },
      err => {
        if (err) {
          diag.error('Error running response hook', err);
        }
      },
      true,
    );
  }
}

export function patchCallback(
  instrumentationConfig: PgInstrumentationConfig,
  span: Span,
  cb: PostgresCallback,
  attributes: Attributes,
  recordDuration: { (): void },
): PostgresCallback {
  return function patchedCallback(this: PgClientExtended, err: Error, res: object) {
    if (err) {
      if (Object.prototype.hasOwnProperty.call(err, 'code')) {
        attributes[ATTR_ERROR_TYPE] = (err as any)['code'];
      }
      if (err instanceof Error) {
        span.recordException(sanitizedErrorMessage(err));
      }
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: err.message,
      });
    } else {
      handleExecutionResult(instrumentationConfig, span, res);
    }

    recordDuration();
    span.end();
    cb.call(this, err, res);
  };
}

export function getPoolName(pool: PgPoolOptionsParams): string {
  let poolName = '';
  poolName += (pool?.host ? `${pool.host}` : 'unknown_host') + ':';
  poolName += (pool?.port ? `${pool.port}` : 'unknown_port') + '/';
  poolName += pool?.database ? `${pool.database}` : 'unknown_database';

  return poolName.trim();
}

export interface poolConnectionsCounter {
  used: number;
  idle: number;
  pending: number;
}

export function updateCounter(
  poolName: string,
  pool: PgPoolExtended,
  connectionCount: UpDownCounter,
  connectionPendingRequests: UpDownCounter,
  latestCounter: poolConnectionsCounter,
): poolConnectionsCounter {
  const all = pool.totalCount;
  const pending = pool.waitingCount;
  const idle = pool.idleCount;
  const used = all - idle;

  connectionCount.add(used - latestCounter.used, {
    [ATTR_DB_CLIENT_CONNECTION_STATE]: DB_CLIENT_CONNECTION_STATE_VALUE_USED,
    [ATTR_DB_CLIENT_CONNECTION_POOL_NAME]: poolName,
  });

  connectionCount.add(idle - latestCounter.idle, {
    [ATTR_DB_CLIENT_CONNECTION_STATE]: DB_CLIENT_CONNECTION_STATE_VALUE_IDLE,
    [ATTR_DB_CLIENT_CONNECTION_POOL_NAME]: poolName,
  });

  connectionPendingRequests.add(pending - latestCounter.pending, {
    [ATTR_DB_CLIENT_CONNECTION_POOL_NAME]: poolName,
  });

  return { used: used, idle: idle, pending: pending };
}

export function patchCallbackPGPool(span: Span, cb: PgPoolCallback): PgPoolCallback {
  return function patchedCallback(this: PgPoolExtended, err: Error, res: object, done: any) {
    if (err) {
      if (err instanceof Error) {
        span.recordException(sanitizedErrorMessage(err));
      }
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: err.message,
      });
    }
    span.end();
    cb.call(this, err, res, done);
  };
}

export function patchClientConnectCallback(span: Span, cb: Function): Function {
  return function patchedClientConnectCallback(this: PgClient, err: Error) {
    if (err) {
      if (err instanceof Error) {
        span.recordException(sanitizedErrorMessage(err));
      }
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: err.message,
      });
    }
    span.end();
    cb.apply(this, arguments);
  };
}

/**
 * Attempt to get a message string from a thrown value, while being quite
 * defensive, to recognize the fact that, in JS, any kind of value (even
 * primitives) can be thrown.
 */
export function getErrorMessage(e: unknown) {
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

/**
 * Generates a sanitized message for the error.
 * Only includes the error type and PostgreSQL error code, omitting any sensitive details.
 */
export function sanitizedErrorMessage(error: unknown): string {
  const name = (error as any)?.name ?? 'PostgreSQLError';
  const code = (error as any)?.code ?? 'UNKNOWN';

  return `PostgreSQL error of type '${name}' occurred (code: ${code})`;
}
