/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-koa
 * - Upstream version: @opentelemetry/instrumentation-koa@0.66.0
 */

import type { InstrumentationConfig } from '@opentelemetry/instrumentation';

export enum KoaLayerType {
  ROUTER = 'router',
  MIDDLEWARE = 'middleware',
}

/**
 * Options available for the Koa Instrumentation (see [documentation](https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-Instrumentation-koa#koa-Instrumentation-options))
 */
export interface KoaInstrumentationConfig extends InstrumentationConfig {
  /** Ignore specific layers based on their type */
  ignoreLayersType?: KoaLayerType[];
}
