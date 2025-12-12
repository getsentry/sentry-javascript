// Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/cc7eff47e2e7bad7678241b766753d5bd6dbc85f/packages/instrumentation-aws-lambda/src/types.ts
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
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Context as OtelContext, Span } from '@opentelemetry/api';
import type { InstrumentationConfig } from '@opentelemetry/instrumentation';
import type { Context } from 'aws-lambda';

export type RequestHook = (span: Span, hookInfo: { event: any; context: Context }) => void;

export type ResponseHook = (
  span: Span,
  hookInfo: {
    err?: Error | string | null;
    res?: any;
  },
) => void;

export type EventContextExtractor = (event: any, context: Context) => OtelContext;
export interface AwsLambdaInstrumentationConfig extends InstrumentationConfig {
  requestHook?: RequestHook;
  responseHook?: ResponseHook;
  eventContextExtractor?: EventContextExtractor;
  lambdaHandler?: string;
  lambdaStartTime?: number;
}
