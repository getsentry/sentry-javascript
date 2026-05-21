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
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/ed97091c9890dd18e52759f2ea98e9d7593b3ae4/packages/instrumentation-pg
 * - Upstream version: @opentelemetry/instrumentation-pg@0.66.0
 */
/* eslint-disable */

// Postgresql specific attributes not covered by semantic conventions
export enum AttributeNames {
  PG_VALUES = 'db.postgresql.values',
  PG_PLAN = 'db.postgresql.plan',
  IDLE_TIMEOUT_MILLIS = 'db.postgresql.idle.timeout.millis',
  MAX_CLIENT = 'db.postgresql.max.client',
}
