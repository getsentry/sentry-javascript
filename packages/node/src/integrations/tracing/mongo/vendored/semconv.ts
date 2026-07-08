/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-mongodb
 * - Upstream version: @opentelemetry/instrumentation-mongodb@0.71.0
 */

/*
 * This file contains a copy of unstable semantic convention definitions
 * used by this package.
 * @see https://github.com/open-telemetry/opentelemetry-js/tree/main/semantic-conventions#unstable-semconv
 */

/**
 * Deprecated, use `server.address`, `server.port` attributes instead.
 *
 * @deprecated Replaced by `server.address` and `server.port`.
 */
export const ATTR_DB_CONNECTION_STRING = 'db.connection_string' as const;

/**
 * Deprecated, use `db.collection.name` instead.
 *
 * @deprecated Replaced by `db.collection.name`.
 */
export const ATTR_DB_MONGODB_COLLECTION = 'db.mongodb.collection' as const;

/**
 * Enum value "mongodb" for attribute `db.system`.
 */
export const DB_SYSTEM_VALUE_MONGODB = 'mongodb' as const;
