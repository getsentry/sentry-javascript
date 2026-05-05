/*
 * Copyright The OpenTelemetry Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
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
export const ATTR_DB_STATEMENT = 'db.statement';
export const ATTR_DB_SYSTEM = 'db.system';
export const ATTR_NET_PEER_NAME = 'net.peer.name';
export const ATTR_NET_PEER_PORT = 'net.peer.port';
export const DB_SYSTEM_NAME_VALUE_REDIS = 'redis';
export const DB_SYSTEM_VALUE_REDIS = 'redis';
