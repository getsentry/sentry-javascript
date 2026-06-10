/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-dataloader
 * - Upstream version: @opentelemetry/instrumentation-dataloader@0.35.0
 */

import type { InstrumentationConfig } from '@opentelemetry/instrumentation';

export interface DataloaderInstrumentationConfig extends InstrumentationConfig {
  /**
   * Whether the instrumentation requires a parent span, if set to true
   * and there is no parent span, no additional spans are created
   * (default: true)
   */
  requireParentSpan?: boolean;
}
