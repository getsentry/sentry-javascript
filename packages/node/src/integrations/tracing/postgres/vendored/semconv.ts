/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-pg
 * - Upstream version: @opentelemetry/instrumentation-pg@0.70.0
 * - Trimmed to the (old) semantic conventions the SDK actually emits
 */

/*
 * This file contains a copy of unstable semantic convention definitions
 * used by this package.
 * @see https://github.com/open-telemetry/opentelemetry-js/tree/main/semantic-conventions#unstable-semconv
 */

/**
 * Deprecated, use `server.address`, `server.port` attributes instead.
 *
 * @example "Server=(localdb)\\v11.0;Integrated Security=true;"
 *
 * @deprecated Replaced by `server.address` and `server.port`.
 */
export const ATTR_DB_CONNECTION_STRING = 'db.connection_string' as const;

/**
 * Deprecated, use `db.namespace` instead.
 *
 * @example customers
 * @example main
 *
 * @deprecated Replaced by `db.namespace`.
 */
export const ATTR_DB_NAME = 'db.name' as const;

/**
 * The database statement being executed.
 *
 * @example SELECT * FROM wuser_table
 * @example SET mykey "WuValue"
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
 * Deprecated, no replacement at this time.
 *
 * @example readonly_user
 * @example reporting_user
 *
 * @deprecated Removed, no replacement at this time.
 */
export const ATTR_DB_USER = 'db.user' as const;

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
 * Enum value "postgresql" for attribute {@link ATTR_DB_SYSTEM}.
 */
export const DB_SYSTEM_VALUE_POSTGRESQL = 'postgresql' as const;
