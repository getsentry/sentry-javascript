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

/*
 * This file contains constants for values that where replaced/removed from
 * Semantic Conventions long enough ago that they do not have `ATTR_*`
 * constants in the `@opentelemetry/semantic-conventions` package. Eventually
 * it is expected that this instrumention will be updated to emit telemetry
 * using modern Semantic Conventions, dropping the need for the constants in
 * this file.
 */

/**
 * The execution ID of the current function execution.
 *
 * @deprecated Use ATTR_FAAS_INVOCATION_ID in [incubating entry-point]({@link https://github.com/open-telemetry/opentelemetry-js/blob/main/semantic-conventions/README.md#unstable-semconv}).
 */
export const ATTR_FAAS_EXECUTION = 'faas.execution' as const;

/**
 * The message destination name. This might be equal to the span name but is required nevertheless.
 *
 * @deprecated Use ATTR_MESSAGING_DESTINATION_NAME in [incubating entry-point]({@link https://github.com/open-telemetry/opentelemetry-js/blob/main/semantic-conventions/README.md#unstable-semconv}).
 */
export const ATTR_MESSAGING_DESTINATION = 'messaging.destination' as const;

/**
 * The kind of message destination.
 *
 * @deprecated Removed in semconv v1.20.0.
 */
export const ATTR_MESSAGING_DESTINATION_KIND = 'messaging.destination_kind' as const;

/**
 * The kind of message destination.
 *
 * @deprecated Removed in semconv v1.20.0.
 */
export const MESSAGING_DESTINATION_KIND_VALUE_TOPIC = 'topic' as const;

/**
 * A string identifying the kind of message consumption as defined in the [Operation names](#operation-names) section above. If the operation is &#34;send&#34;, this attribute MUST NOT be set, since the operation can be inferred from the span kind in that case.
 *
 * @deprecated Use MESSAGING_OPERATION_TYPE_VALUE_RECEIVE in [incubating entry-point]({@link https://github.com/open-telemetry/opentelemetry-js/blob/main/semantic-conventions/README.md#unstable-semconv}).
 */
export const MESSAGING_OPERATION_VALUE_RECEIVE = 'receive' as const;
