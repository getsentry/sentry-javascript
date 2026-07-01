/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/instrumentation-redis-v0.62.0/packages/redis-common
 * - Upstream version: @opentelemetry/redis-common@0.38.2
 *
 * The implementation lives in `@sentry/server-utils` (shared with the orchestrion
 * ioredis subscriber). Re-exported here to keep the import path stable for the
 * vendored redis/ioredis instrumentations.
 */

export { defaultDbStatementSerializer } from '@sentry/server-utils';
