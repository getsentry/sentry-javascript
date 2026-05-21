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
 * - Types from `pg` package inlined as simplified interfaces
 */
/* eslint-disable */

import type { QueryResult, QueryArrayResult } from './pg-types';
import type * as api from '@opentelemetry/api';
import { InstrumentationConfig } from '@opentelemetry/instrumentation';

export interface PgResponseHookInformation {
  data: QueryResult | QueryArrayResult;
}

export interface PgInstrumentationExecutionResponseHook {
  (span: api.Span, responseInfo: PgResponseHookInformation): void;
}

export interface PgRequestHookInformation {
  query: {
    text: string;
    name?: string;
    values?: unknown[];
  };
  connection: {
    database?: string;
    host?: string;
    port?: number;
    user?: string;
  };
}

export interface PgInstrumentationExecutionRequestHook {
  (span: api.Span, queryInfo: PgRequestHookInformation): void;
}

export interface PgInstrumentationConfig extends InstrumentationConfig {
  /**
   * If true, an attribute containing the query's parameters will be attached
   * the spans generated to represent the query.
   */
  enhancedDatabaseReporting?: boolean;

  /**
   * Hook that allows adding custom span attributes or updating the
   * span's name based on the data about the query to execute.
   *
   * @default undefined
   */
  requestHook?: PgInstrumentationExecutionRequestHook;

  /**
   * Hook that allows adding custom span attributes based on the data
   * returned from "query" Pg actions.
   *
   * @default undefined
   */
  responseHook?: PgInstrumentationExecutionResponseHook;

  /**
   * If true, requires a parent span to create new spans.
   *
   * @default false
   */
  requireParentSpan?: boolean;

  /**
   * If true, queries are modified to also include a comment with
   * the tracing context, following the {@link https://github.com/open-telemetry/opentelemetry-sqlcommenter sqlcommenter} format
   */
  addSqlCommenterCommentToQueries?: boolean;

  /**
   * If true, `pg.connect` and `pg-pool.connect` spans will not be created.
   * Query spans and pool metrics are still recorded.
   *
   * @default false
   */
  ignoreConnectSpans?: boolean;
}
