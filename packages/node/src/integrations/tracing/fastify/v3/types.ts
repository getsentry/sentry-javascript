// Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/407f61591ba69a39a6908264379d4d98a48dbec4/plugins/node/opentelemetry-instrumentation-fastify/src/types.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
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

import type { Span } from '@opentelemetry/api';
import type { InstrumentationConfig } from '@opentelemetry/instrumentation';

export interface FastifyRequestInfo {
  request: any; // FastifyRequest object from fastify package
}

/**
 * Function that can be used to add custom attributes to the current span
 * @param span - The Fastify handler span.
 * @param info - The Fastify request info object.
 */
export interface FastifyCustomAttributeFunction {
  (span: Span, info: FastifyRequestInfo): void;
}

/**
 * Options available for the Fastify Instrumentation
 */
export interface FastifyInstrumentationConfig extends InstrumentationConfig {
  /** Function for adding custom attributes to each handler span */
  requestHook?: FastifyCustomAttributeFunction;
}
