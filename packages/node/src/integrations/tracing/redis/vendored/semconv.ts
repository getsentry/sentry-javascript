/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/instrumentation-redis-v0.62.0/packages/instrumentation-redis
 * - Upstream version: @opentelemetry/instrumentation-redis@0.62.0
 * - Minor TypeScript adjustments for this repository's compiler settings
 */
/* eslint-disable -- vendored @opentelemetry/instrumentation-redis */

/*
 * This file contains a copy of unstable semantic convention definitions
 * used by the vendored redis/ioredis instrumentations.
 * @see https://github.com/open-telemetry/opentelemetry-js/tree/main/semantic-conventions#unstable-semconv
 */

// Deprecated constants kept for backwards compatibility with older semconv
export const ATTR_DB_CONNECTION_STRING = 'db.connection_string';
export const ATTR_NET_PEER_NAME = 'net.peer.name';
export const ATTR_NET_PEER_PORT = 'net.peer.port';
export const DB_SYSTEM_NAME_VALUE_REDIS = 'redis';
export const DB_SYSTEM_VALUE_REDIS = 'redis';
