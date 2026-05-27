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
/* eslint-disable */

export enum AttributeNames {
  SOURCE = 'graphql.source',
  FIELD_NAME = 'graphql.field.name',
  FIELD_PATH = 'graphql.field.path',
  FIELD_TYPE = 'graphql.field.type',
  PARENT_NAME = 'graphql.parent.name',
  OPERATION_TYPE = 'graphql.operation.type',
  OPERATION_NAME = 'graphql.operation.name',
  VARIABLES = 'graphql.variables.',
  ERROR_VALIDATION_NAME = 'graphql.validation.error',
}
