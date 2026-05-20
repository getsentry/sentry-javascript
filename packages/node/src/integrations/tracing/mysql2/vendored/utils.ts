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
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-mysql2
 * - Upstream version: @opentelemetry/instrumentation-mysql2@0.64.0
 * - Types from 'mysql2' inlined as simplified interfaces
 */
/* eslint-disable */

import { Attributes } from '@opentelemetry/api';
import {
  ATTR_DB_CONNECTION_STRING,
  ATTR_DB_NAME,
  ATTR_DB_USER,
  ATTR_NET_PEER_NAME,
  ATTR_NET_PEER_PORT,
} from './semconv';
import type { FormatFunction } from './mysql2-types';
import { MySQL2InstrumentationQueryMaskingHook } from './types';
import { SemconvStability } from '@opentelemetry/instrumentation';
import { ATTR_DB_NAMESPACE, ATTR_SERVER_ADDRESS, ATTR_SERVER_PORT } from '@opentelemetry/semantic-conventions';

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

export function getConnectionAttributes(
  config: Config,
  dbSemconvStability: SemconvStability,
  netSemconvStability: SemconvStability,
): Attributes {
  const { host, port, database, user } = getConfig(config);

  const attrs: Attributes = {};
  if (dbSemconvStability & SemconvStability.OLD) {
    attrs[ATTR_DB_CONNECTION_STRING] = getJDBCString(host, port, database);
    attrs[ATTR_DB_NAME] = database;
    attrs[ATTR_DB_USER] = user;
  }
  if (dbSemconvStability & SemconvStability.STABLE) {
    attrs[ATTR_DB_NAMESPACE] = database;
  }

  const portNumber = parseInt(port, 10);
  if (netSemconvStability & SemconvStability.OLD) {
    attrs[ATTR_NET_PEER_NAME] = host;
    if (!isNaN(portNumber)) {
      attrs[ATTR_NET_PEER_PORT] = portNumber;
    }
  }
  if (netSemconvStability & SemconvStability.STABLE) {
    attrs[ATTR_SERVER_ADDRESS] = host;
    if (!isNaN(portNumber)) {
      attrs[ATTR_SERVER_PORT] = portNumber;
    }
  }

  return attrs;
}

function getConfig(config: any) {
  const { host, port, database, user } = (config && config.connectionConfig) || config || {};
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

export function getQueryText(
  query: string | Query | QueryOptions,
  format?: FormatFunction,
  values?: any[],
  maskStatement = false,
  maskStatementHook: MySQL2InstrumentationQueryMaskingHook = defaultMaskingHook,
): string {
  const [querySql, queryValues] =
    typeof query === 'string' ? [query, values] : [query.sql, hasValues(query) ? values || query.values : values];
  try {
    if (maskStatement) {
      return maskStatementHook(querySql);
    } else if (format && queryValues) {
      return format(querySql, queryValues);
    } else {
      return querySql;
    }
  } catch (e) {
    return 'Could not determine the query due to an error in masking or formatting';
  }
}

function defaultMaskingHook(query: string): string {
  return query.replace(/\b\d+\b/g, '?').replace(/(["'])(?:(?=(\\?))\2.)*?\1/g, '?');
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
