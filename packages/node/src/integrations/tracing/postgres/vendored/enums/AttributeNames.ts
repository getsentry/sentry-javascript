/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-pg
 * - Upstream version: @opentelemetry/instrumentation-pg@0.70.0
 */

// Postgresql specific attributes not covered by semantic conventions
export enum AttributeNames {
  PG_PLAN = 'db.postgresql.plan',
  IDLE_TIMEOUT_MILLIS = 'db.postgresql.idle.timeout.millis',
  MAX_CLIENT = 'db.postgresql.max.client',
}
