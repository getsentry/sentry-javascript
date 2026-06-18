/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-mysql
 * - Upstream version: @opentelemetry/instrumentation-mysql@0.64.0
 */
/* eslint-disable */

import { InstrumentationConfig } from '@opentelemetry/instrumentation';

export interface MySQLInstrumentationConfig extends InstrumentationConfig {
  /**
   * If true, an attribute containing the query's parameters will be attached
   * the spans generated to represent the query.
   */
  enhancedDatabaseReporting?: boolean;
}
