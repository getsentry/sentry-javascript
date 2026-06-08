/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-knex
 * - Upstream version: @opentelemetry/instrumentation-knex@0.62.0
 */
/* eslint-disable */

/**
 * @deprecated Replaced by `db.namespace`.
 */
export const ATTR_DB_NAME = 'db.name' as const;

/**
 * @deprecated Replaced by `db.operation.name`.
 */
export const ATTR_DB_OPERATION = 'db.operation' as const;

/**
 * @deprecated Replaced by `db.collection.name`.
 */
export const ATTR_DB_SQL_TABLE = 'db.sql.table' as const;

/**
 * @deprecated Replaced by `db.query.text`.
 */
export const ATTR_DB_STATEMENT = 'db.statement' as const;

/**
 * @deprecated Replaced by `db.system.name`.
 */
export const ATTR_DB_SYSTEM = 'db.system' as const;

/**
 * @deprecated Removed, no replacement at this time.
 */
export const ATTR_DB_USER = 'db.user' as const;

/**
 * @deprecated Replaced by `server.address` on client spans and `client.address` on server spans.
 */
export const ATTR_NET_PEER_NAME = 'net.peer.name' as const;

/**
 * @deprecated Replaced by `server.port` on client spans and `client.port` on server spans.
 */
export const ATTR_NET_PEER_PORT = 'net.peer.port' as const;

/**
 * @deprecated Replaced by `network.transport`.
 */
export const ATTR_NET_TRANSPORT = 'net.transport' as const;

export const DB_SYSTEM_NAME_VALUE_SQLITE = 'sqlite' as const;
