/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-knex
 * - Upstream version: @opentelemetry/instrumentation-knex@0.62.0
 */

/**
 * @deprecated Replaced by `db.collection.name`.
 */
export const ATTR_DB_SQL_TABLE = 'db.sql.table' as const;

export const DB_SYSTEM_NAME_VALUE_SQLITE = 'sqlite' as const;

export const DB_SYSTEM_NAME_VALUE_POSTGRESQL = 'postgresql' as const;
