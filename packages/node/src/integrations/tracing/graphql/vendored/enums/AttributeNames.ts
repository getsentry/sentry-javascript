/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
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
