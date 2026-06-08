/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-knex
 * - Upstream version: @opentelemetry/instrumentation-knex@0.62.0
 */
/* eslint-disable */

import { InstrumentationConfig } from '@opentelemetry/instrumentation';

export interface KnexInstrumentationConfig extends InstrumentationConfig {
  /** max query length in db.statement attribute ".." is added to the end when query is truncated  */
  maxQueryLength?: number;
  /** only create spans if part of an existing trace */
  requireParentSpan?: boolean;
}
