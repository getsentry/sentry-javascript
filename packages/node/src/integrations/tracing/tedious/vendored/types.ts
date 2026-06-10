/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-tedious
 * - Upstream version: @opentelemetry/instrumentation-tedious@0.37.0
 */
/* eslint-disable */

import { InstrumentationConfig } from '@opentelemetry/instrumentation';
export interface TediousInstrumentationConfig extends InstrumentationConfig {
  /**
   * If true, injects the current DB span's W3C traceparent into SQL Server
   * session state via `SET CONTEXT_INFO @opentelemetry_traceparent` (varbinary).
   * Off by default to avoid the extra round-trip per request.
   */
  enableTraceContextPropagation?: boolean;
}
