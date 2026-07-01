/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-tedious
 * - Upstream version: @opentelemetry/instrumentation-tedious@0.37.0
 */

/*
 * This file contains a copy of unstable semantic convention definitions
 * used by this package.
 * @see https://github.com/open-telemetry/opentelemetry-js/tree/main/semantic-conventions#unstable-semconv
 */

/**
 * Deprecated, use `db.collection.name` instead.
 *
 * @example "mytable"
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 *
 * @deprecated Replaced by `db.collection.name`, but only if not extracting the value from `db.query.text`.
 */
export const ATTR_DB_SQL_TABLE = 'db.sql.table' as const;

/**
 * Enum value "mssql" for attribute `db.system`.
 *
 * Microsoft SQL Server
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const DB_SYSTEM_VALUE_MSSQL = 'mssql' as const;
