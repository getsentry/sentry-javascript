/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-pg
 * - Upstream version: @opentelemetry/instrumentation-pg@0.70.0
 * - Trimmed to the config the SDK actually passes
 */

import type { InstrumentationConfig } from '@opentelemetry/instrumentation';

export interface PgInstrumentationConfig extends InstrumentationConfig {
  /**
   * If true, `pg.connect` and `pg-pool.connect` spans will not be created.
   * Query spans are still recorded.
   *
   * @default false
   */
  ignoreConnectSpans?: boolean;
}
