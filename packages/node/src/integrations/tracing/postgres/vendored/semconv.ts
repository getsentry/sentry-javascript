/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-pg
 * - Upstream version: @opentelemetry/instrumentation-pg@0.70.0
 */
/* eslint-disable */

/*
 * This file contains a copy of unstable semantic convention definitions
 * used by this package.
 * @see https://github.com/open-telemetry/opentelemetry-js/tree/main/semantic-conventions#unstable-semconv
 */

/**
 * The name of the connection pool; unique within the instrumented application. In case the connection pool implementation doesn't provide a name, instrumentation **SHOULD** use a combination of parameters that would make the name unique, for example, combining attributes `server.address`, `server.port`, and `db.namespace`, formatted as `server.address:server.port/db.namespace`. Instrumentations that generate connection pool name following different patterns **SHOULD** document it.
 *
 * @example myDataSource
 */
export const ATTR_DB_CLIENT_CONNECTION_POOL_NAME = 'db.client.connection.pool.name' as const;

/**
 * The state of a connection in the pool
 *
 * @example idle
 */
export const ATTR_DB_CLIENT_CONNECTION_STATE = 'db.client.connection.state' as const;

/**
 * Deprecated, use `server.address`, `server.port` attributes instead.
 *
 * @example "Server=(localdb)\\v11.0;Integrated Security=true;"
 *
 * @deprecated Replaced by `server.address` and `server.port`.
 */
export const ATTR_DB_CONNECTION_STRING = 'db.connection_string' as const;

/**
 * Deprecated, use `server.address` on client spans and `client.address` on server spans.
 *
 * @example example.com
 *
 * @deprecated Replaced by `server.address` on client spans and `client.address` on server spans.
 */
export const ATTR_NET_PEER_NAME = 'net.peer.name' as const;

/**
 * Deprecated, use `server.port` on client spans and `client.port` on server spans.
 *
 * @example 8080
 *
 * @deprecated Replaced by `server.port` on client spans and `client.port` on server spans.
 */
export const ATTR_NET_PEER_PORT = 'net.peer.port' as const;

/**
 * Enum value "idle" for attribute {@link ATTR_DB_CLIENT_CONNECTION_STATE}.
 */
export const DB_CLIENT_CONNECTION_STATE_VALUE_IDLE = 'idle' as const;

/**
 * Enum value "used" for attribute {@link ATTR_DB_CLIENT_CONNECTION_STATE}.
 */
export const DB_CLIENT_CONNECTION_STATE_VALUE_USED = 'used' as const;

/**
 * Enum value "postgresql" for attribute `db.system`.
 */
export const DB_SYSTEM_VALUE_POSTGRESQL = 'postgresql' as const;

/**
 * Enum value "postgresql" for attribute `db.system.name`.
 */
export const DB_SYSTEM_NAME_VALUE_POSTGRESQL = 'postgresql' as const;

/**
 * Duration of database client operations.
 *
 */
export const METRIC_DB_CLIENT_OPERATION_DURATION = 'db.client.operation.duration' as const;

/**
 * The number of connections that are currently in state described by the `state` attribute
 */
export const METRIC_DB_CLIENT_CONNECTION_COUNT = 'db.client.connection.count' as const;

/**
 * The number of current pending requests for an open connection
 */
export const METRIC_DB_CLIENT_CONNECTION_PENDING_REQUESTS = 'db.client.connection.pending_requests' as const;
