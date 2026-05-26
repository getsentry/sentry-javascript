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
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-mongoose
 * - Upstream version: @opentelemetry/instrumentation-mongoose@0.64.0
 */
/* eslint-disable */

import { Span } from '@opentelemetry/api';
import { InstrumentationConfig } from '@opentelemetry/instrumentation';

export interface SerializerPayload {
  condition?: any;
  options?: any;
  updates?: any;
  document?: any;
  aggregatePipeline?: any;
  fields?: any;
  documents?: any;
  operations?: any;
}

export type DbStatementSerializer = (operation: string, payload: SerializerPayload) => string;

export interface ResponseInfo {
  moduleVersion: string | undefined;
  response: any;
}

export type MongooseResponseCustomAttributesFunction = (span: Span, responseInfo: ResponseInfo) => void;

export interface MongooseInstrumentationConfig extends InstrumentationConfig {
  /**
   * Mongoose operation use mongodb under the hood.
   * If mongodb instrumentation is enabled, a mongoose operation will also create
   * a mongodb operation describing the communication with mongoDB servers.
   * Setting the `suppressInternalInstrumentation` config value to `true` will
   * cause the instrumentation to suppress instrumentation of underlying operations,
   * effectively causing mongodb spans to be non-recordable.
   */
  suppressInternalInstrumentation?: boolean;

  /** Custom serializer function for the db.statement tag */
  dbStatementSerializer?: DbStatementSerializer;

  /** hook for adding custom attributes using the response payload */
  responseHook?: MongooseResponseCustomAttributesFunction;

  /** Set to true if you do not want to collect traces that start with mongoose */
  requireParentSpan?: boolean;
}
