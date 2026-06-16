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
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-aws-sdk
 * - Upstream version: @opentelemetry/instrumentation-aws-sdk@0.73.0
 */

import { DiagLogger, Span, SpanAttributes, SpanKind } from '@opentelemetry/api';
import { AwsSdkInstrumentationConfig, NormalizedRequest, NormalizedResponse } from '../types';

export interface RequestMetadata {
  // isIncoming - if true, then the operation callback / promise should be bind with the operation's span
  isIncoming: boolean;
  // isStream - if true, then the response is a stream so the span should not be ended by the middleware.
  // the ServiceExtension must end the span itself, generally by wrapping the stream and ending after it is
  // consumed.
  isStream?: boolean;
  spanAttributes?: SpanAttributes;
  spanKind?: SpanKind;
  spanName?: string;
}

export interface ServiceExtension {
  // called before request is sent, and before span is started
  requestPreSpanHook: (
    request: NormalizedRequest,
    config: AwsSdkInstrumentationConfig,
    diag: DiagLogger,
  ) => RequestMetadata;

  // called before request is sent, and after span is started
  requestPostSpanHook?: (request: NormalizedRequest) => void;

  // called after response is received. If value is returned, it replaces the response output.
  responseHook?: (response: NormalizedResponse, span: Span) => any | undefined;
}
