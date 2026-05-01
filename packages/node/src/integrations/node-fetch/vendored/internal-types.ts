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
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/ed97091c9890dd18e52759f2ea98e9d7593b3ae4/packages/instrumentation-undici
 * - Upstream version: @opentelemetry/instrumentation-undici@0.24.0
 * - Tracking issue: https://github.com/getsentry/sentry-javascript/issues/20165
 */
/* eslint-disable -- vendored @opentelemetry/instrumentation-undici (#20165) */

import type { UndiciRequest, UndiciResponse } from './types';

export interface ListenerRecord {
  name: string;
  unsubscribe: () => void;
}

export interface RequestMessage {
  request: UndiciRequest;
}

export interface RequestHeadersMessage {
  request: UndiciRequest;
  socket: any;
}

export interface ResponseHeadersMessage {
  request: UndiciRequest;
  response: UndiciResponse;
}

export interface RequestTrailersMessage {
  request: UndiciRequest;
  response: UndiciResponse;
}

export interface RequestErrorMessage {
  request: UndiciRequest;
  error: Error;
}
