// Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/cc7eff47e2e7bad7678241b766753d5bd6dbc85f/packages/instrumentation-aws-lambda/src/semconv.ts
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

/*
 * This file contains a copy of unstable semantic convention definitions
 * used by this package.
 * @see https://github.com/open-telemetry/opentelemetry-js/tree/main/semantic-conventions#unstable-semconv
 */

/**
 * The execution ID of the current function execution.
 *
 * @deprecated Removed from the stable semantic conventions; not present in `@sentry/conventions`, so vendored here.
 */
export const ATTR_FAAS_EXECUTION = 'faas.execution';

/**
 * The unique ID of the single function that this runtime instance executes.
 *
 * @deprecated Removed from the stable semantic conventions; not present in `@sentry/conventions`, so vendored here.
 */
export const ATTR_FAAS_ID = 'faas.id';
