/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-mysql2
 * - Upstream version: @opentelemetry/instrumentation-mysql2@0.64.0
 */
/* eslint-disable */

import { InstrumentationConfig } from '@opentelemetry/instrumentation';
import type { Span } from '@opentelemetry/api';

export interface MySQL2ResponseHookInformation {
  queryResults: any;
}

export interface MySQL2InstrumentationExecutionResponseHook {
  (span: Span, responseHookInfo: MySQL2ResponseHookInformation): void;
}

export interface MySQL2InstrumentationQueryMaskingHook {
  (query: string): string;
}

export interface MySQL2InstrumentationConfig extends InstrumentationConfig {
  maskStatement?: boolean;
  maskStatementHook?: MySQL2InstrumentationQueryMaskingHook;
  responseHook?: MySQL2InstrumentationExecutionResponseHook;
  addSqlCommenterCommentToQueries?: boolean;
}
