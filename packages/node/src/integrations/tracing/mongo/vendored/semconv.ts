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
 * Deprecated, use `db.namespace` instead.
 *
 * @deprecated Replaced by `db.namespace`.
 */
export const ATTR_DB_NAME = 'db.name' as const;

/**
 * Deprecated, use `db.operation.name` instead.
 *
 * @deprecated Replaced by `db.operation.name`.
 */
export const ATTR_DB_OPERATION = 'db.operation' as const;

/**
 * The database statement being executed.
 *
 * @deprecated Replaced by `db.query.text`.
 */
export const ATTR_DB_STATEMENT = 'db.statement' as const;

/**
 * Deprecated, use `db.system.name` instead.
 *
 * @deprecated Replaced by `db.system.name`.
 */
export const ATTR_DB_SYSTEM = 'db.system' as const;

/**
 * Deprecated, use `server.address` on client spans and `client.address` on server spans.
 *
 * @deprecated Replaced by `server.address` on client spans and `client.address` on server spans.
 */
export const ATTR_NET_PEER_NAME = 'net.peer.name' as const;

/**
 * Deprecated, use `server.port` on client spans and `client.port` on server spans.
 *
 * @deprecated Replaced by `server.port` on client spans and `client.port` on server spans.
 */
export const ATTR_NET_PEER_PORT = 'net.peer.port' as const;

/**
 * Enum value "mongodb" for attribute {@link ATTR_DB_SYSTEM}.
 */
export const DB_SYSTEM_VALUE_MONGODB = 'mongodb' as const;
