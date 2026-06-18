/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-mysql2
 * - Upstream version: @opentelemetry/instrumentation-mysql2@0.64.0
 */

export const ATTR_DB_CONNECTION_STRING = 'db.connection_string' as const;
export const ATTR_DB_NAME = 'db.name' as const;
export const ATTR_DB_STATEMENT = 'db.statement' as const;
export const ATTR_DB_SYSTEM = 'db.system' as const;
export const ATTR_DB_USER = 'db.user' as const;
export const ATTR_NET_PEER_NAME = 'net.peer.name' as const;
export const ATTR_NET_PEER_PORT = 'net.peer.port' as const;
export const DB_SYSTEM_VALUE_MYSQL = 'mysql' as const;
