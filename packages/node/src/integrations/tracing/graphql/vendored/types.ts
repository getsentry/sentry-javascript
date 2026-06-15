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
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-graphql
 * - Upstream version: @opentelemetry/instrumentation-graphql@0.66.0
 */

import type { InstrumentationConfig } from '@opentelemetry/instrumentation';

export interface GraphQLInstrumentationConfig extends InstrumentationConfig {
  /**
   * Do not create spans for resolvers.
   *
   * @default false
   */
  ignoreResolveSpans?: boolean;

  /**
   * Don't create spans for the execution of the default resolver on object properties.
   *
   * When a resolver function is not defined on the schema for a field, graphql will
   * use the default resolver which just looks for a property with that name on the object.
   * If the property is not a function, it's not very interesting to trace.
   * This option can reduce noise and number of spans created.
   *
   * @default false
   */
  ignoreTrivialResolveSpans?: boolean;

  /**
   * If this is enabled, a `http.server` root span containing the execute span will automatically be renamed
   * to include the operation name.
   *
   * @default false
   */
  useOperationNameForRootSpan?: boolean;
}

// Utility type to make specific properties required
type RequireSpecificKeys<T, K extends keyof T> = T & { [P in K]-?: T[P] };

// Merged and parsed config of default instrumentation config and GraphQL
export type GraphQLInstrumentationParsedConfig = RequireSpecificKeys<
  GraphQLInstrumentationConfig,
  'ignoreResolveSpans'
>;
