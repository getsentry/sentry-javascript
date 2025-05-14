// Vendored from https://github.com/open-telemetry/opentelemetry-js-contrib/blob/407f61591ba69a39a6908264379d4d98a48dbec4/plugins/node/opentelemetry-instrumentation-fastify/src/constants.ts
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

export const spanRequestSymbol = Symbol('opentelemetry.instrumentation.fastify.request_active_span');

// The instrumentation creates a span for invocations of lifecycle hook handlers
// that take `(request, reply, ...[, done])` arguments. Currently this is all
// lifecycle hooks except `onRequestAbort`.
// https://fastify.dev/docs/latest/Reference/Hooks
export const hooksNamesToWrap = new Set([
  'onTimeout',
  'onRequest',
  'preParsing',
  'preValidation',
  'preSerialization',
  'preHandler',
  'onSend',
  'onResponse',
  'onError',
]);
