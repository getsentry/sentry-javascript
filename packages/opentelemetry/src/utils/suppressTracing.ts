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
 * - Minimal vendored implementation of the tracing-suppression helpers from
 *   `@opentelemetry/core` to avoid pulling in that dependency.
 * - The context key string must stay byte-identical to OTel's, since other
 *   OpenTelemetry instrumentation (e.g. `@opentelemetry/instrumentation-http`)
 *   writes to the same key and our tracer reads it back to suppress spans.
 * - `unsuppressTracing` is dropped, as the SDK never removes the flag.
 */
import type { Context } from '@opentelemetry/api';
import { createContextKey } from '@opentelemetry/api';

const SUPPRESS_TRACING_KEY = createContextKey('OpenTelemetry SDK Context Key SUPPRESS_TRACING');

/** Returns a new context with tracing suppressed, so no spans are created within it. */
export function suppressTracing(context: Context): Context {
  return context.setValue(SUPPRESS_TRACING_KEY, true);
}

/** Whether tracing is suppressed in the given context. */
export function isTracingSuppressed(context: Context): boolean {
  return context.getValue(SUPPRESS_TRACING_KEY) === true;
}
