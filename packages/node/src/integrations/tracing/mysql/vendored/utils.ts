/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-mysql
 * - Upstream version: @opentelemetry/instrumentation-mysql@0.64.0
 * - Types from the `mysql` package inlined as simplified interfaces
 */
/* eslint-disable */

import type { Pool, Query, QueryOptions } from './mysql-types';

export function getConfig(config: any) {
  const { host, port, database, user } = (config && config.connectionConfig) || config || {};
  return { host, port, database, user };
}

export function getJDBCString(host: string | undefined, port: number | undefined, database: string | undefined) {
  let jdbcString = `jdbc:mysql://${host || 'localhost'}`;

  if (typeof port === 'number') {
    jdbcString += `:${port}`;
  }

  if (typeof database === 'string') {
    jdbcString += `/${database}`;
  }

  return jdbcString;
}

/**
 * @returns the database query being executed.
 */
export function getDbQueryText(query: string | Query | QueryOptions): string {
  if (typeof query === 'string') {
    return query;
  } else {
    return query.sql;
  }
}

export function getDbValues(query: string | Query | QueryOptions, values?: any[]): string {
  if (typeof query === 'string') {
    return arrayStringifyHelper(values);
  } else {
    // According to https://github.com/mysqljs/mysql#performing-queries
    // The values argument will override the values in the option object.
    return arrayStringifyHelper(values || query.values);
  }
}

/**
 * The span name SHOULD be set to a low cardinality value
 * representing the statement executed on the database.
 *
 * TODO: revisit span name based on https://github.com/open-telemetry/semantic-conventions/blob/v1.33.0/docs/database/database-spans.md#name
 *
 * @returns SQL statement without variable arguments or SQL verb
 */
export function getSpanName(query: string | Query | QueryOptions): string {
  const rawQuery = typeof query === 'object' ? query.sql : query;
  // Extract the SQL verb
  const firstSpace = rawQuery?.indexOf(' ');
  if (typeof firstSpace === 'number' && firstSpace !== -1) {
    return rawQuery?.substring(0, firstSpace);
  }
  return rawQuery;
}

export function arrayStringifyHelper(arr: Array<unknown> | undefined): string {
  if (arr) return `[${arr.toString()}]`;
  return '';
}

export function getPoolNameOld(pool: Pool): string {
  const c = pool.config.connectionConfig;
  let poolName = '';
  poolName += c?.host ? `host: '${c.host}', ` : '';
  poolName += c?.port ? `port: ${c.port}, ` : '';
  poolName += c?.database ? `database: '${c.database}', ` : '';
  poolName += c?.user ? `user: '${c.user}'` : '';
  if (!c?.user) {
    poolName = poolName.substring(0, poolName.length - 2); //omit last comma
  }
  return poolName.trim();
}
