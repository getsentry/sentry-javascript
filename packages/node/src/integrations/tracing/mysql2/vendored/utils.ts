/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-mysql2
 * - Upstream version: @opentelemetry/instrumentation-mysql2@0.64.0
 * - Types from 'mysql2' inlined as simplified interfaces
 * - Refactored to use Sentry's span APIs instead of OpenTelemetry tracing APIs
 */

import type { SpanAttributes } from '@sentry/core';
import { DB_NAME, DB_USER } from '@sentry/conventions/attributes';
import type { FormatFunction } from './mysql2-types';
import { ATTR_DB_CONNECTION_STRING, ATTR_NET_PEER_NAME, ATTR_NET_PEER_PORT } from './semconv';

interface QueryOptions {
  sql: string;
  values?: any | any[] | { [param: string]: any };
}

interface Query {
  sql: string;
}

interface Config {
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  connectionConfig?: Config;
}

export function getConnectionAttributes(config: Config): SpanAttributes {
  const { host, port, database, user } = getConfig(config);

  const attrs: SpanAttributes = {
    [ATTR_DB_CONNECTION_STRING]: getJDBCString(host, port, database),
    // eslint-disable-next-line typescript/no-deprecated
    [DB_NAME]: database,
    [DB_USER]: user,
    [ATTR_NET_PEER_NAME]: host,
  };

  const portNumber = parseInt(port, 10);
  if (!isNaN(portNumber)) {
    attrs[ATTR_NET_PEER_PORT] = portNumber;
  }

  return attrs;
}

function getConfig(config: any) {
  const { host, port, database, user } = config?.connectionConfig || config || {};
  return { host, port, database, user };
}

function getJDBCString(host: string | undefined, port: number | undefined, database: string | undefined) {
  let jdbcString = `jdbc:mysql://${host || 'localhost'}`;

  if (typeof port === 'number') {
    jdbcString += `:${port}`;
  }

  if (typeof database === 'string') {
    jdbcString += `/${database}`;
  }

  return jdbcString;
}

export function getQueryText(query: string | Query | QueryOptions, format?: FormatFunction, values?: any[]): string {
  const [querySql, queryValues] =
    typeof query === 'string' ? [query, values] : [query.sql, hasValues(query) ? values || query.values : values];
  try {
    if (format && queryValues) {
      return format(querySql, queryValues);
    } else {
      return querySql;
    }
  } catch {
    return 'Could not determine the query due to an error in formatting';
  }
}

function hasValues(obj: Query | QueryOptions): obj is QueryOptions {
  return 'values' in obj;
}

export function getSpanName(query: string | Query | QueryOptions): string {
  const rawQuery = typeof query === 'object' ? query.sql : query;
  const firstSpace = rawQuery?.indexOf(' ');
  if (typeof firstSpace === 'number' && firstSpace !== -1) {
    return rawQuery?.substring(0, firstSpace);
  }
  return rawQuery;
}

export const once = (fn: Function) => {
  let called = false;
  return (...args: unknown[]) => {
    if (called) return;
    called = true;
    return fn(...args);
  };
};

export function getConnectionPrototypeToInstrument(connection: any) {
  const connectionPrototype = connection.prototype;
  const basePrototype = Object.getPrototypeOf(connectionPrototype);

  if (typeof basePrototype?.query === 'function' && typeof basePrototype?.execute === 'function') {
    return basePrototype;
  }

  return connectionPrototype;
}
