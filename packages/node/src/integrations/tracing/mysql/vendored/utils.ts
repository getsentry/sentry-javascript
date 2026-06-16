/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-mysql
 * - Upstream version: @opentelemetry/instrumentation-mysql@0.64.0
 * - Types from the `mysql` package inlined as simplified interfaces
 */

import type { ConnectionConfig, PoolConfig, Query, QueryOptions } from './mysql-types';

export function getConfig(config: ConnectionConfig | PoolConfig | undefined) {
  const resolved = (config as PoolConfig | undefined)?.connectionConfig || config || {};
  const { host, port, database, user } = resolved;
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
