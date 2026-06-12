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
