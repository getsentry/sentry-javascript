/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-graphql
 * - Upstream version: @opentelemetry/instrumentation-graphql@0.66.0
 */

export enum AllowedOperationTypes {
  QUERY = 'query',
  MUTATION = 'mutation',
  SUBSCRIPTION = 'subscription',
}

export enum TokenKind {
  SOF = '<SOF>',
  EOF = '<EOF>',
  BANG = '!',
  DOLLAR = '$',
  AMP = '&',
  PAREN_L = '(',
  PAREN_R = ')',
  SPREAD = '...',
  COLON = ':',
  EQUALS = '=',
  AT = '@',
  BRACKET_L = '[',
  BRACKET_R = ']',
  BRACE_L = '{',
  PIPE = '|',
  BRACE_R = '}',
  NAME = 'Name',
  INT = 'Int',
  FLOAT = 'Float',
  STRING = 'String',
  BLOCK_STRING = 'BlockString',
  COMMENT = 'Comment',
}

export enum SpanNames {
  EXECUTE = 'graphql.execute',
  PARSE = 'graphql.parse',
  RESOLVE = 'graphql.resolve',
  VALIDATE = 'graphql.validate',
  SCHEMA_VALIDATE = 'graphql.validateSchema',
  SCHEMA_PARSE = 'graphql.parseSchema',
}
