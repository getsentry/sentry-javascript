/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-graphql
 * - Upstream version: @opentelemetry/instrumentation-graphql@0.66.0
 * - Types from `graphql` package inlined as simplified interfaces
 * - Minor TypeScript strictness adjustments
 */
/* eslint-disable */

import type * as api from '@opentelemetry/api';
import type {
  DocumentNode,
  ExecutionArgs,
  ExecutionResult,
  GraphQLError,
  GraphQLFieldResolver,
  GraphQLSchema,
  GraphQLTypeResolver,
  Maybe,
  ParseOptions,
  PromiseOrValue,
  Source,
  TypeInfo,
  ValidationRule,
} from './graphql-types';
import { OTEL_GRAPHQL_DATA_SYMBOL, OTEL_PATCHED_SYMBOL } from './symbols';

export type { Maybe } from './graphql-types';

export const OPERATION_NOT_SUPPORTED = 'Operation$operationName$not' + ' supported';

export type executeFunctionWithObj = (args: ExecutionArgs) => PromiseOrValue<ExecutionResult>;

export type executeArgumentsArray = [
  GraphQLSchema,
  DocumentNode,
  any,
  any,
  Maybe<{ [key: string]: any }>,
  Maybe<string>,
  Maybe<GraphQLFieldResolver<any, any>>,
  Maybe<GraphQLTypeResolver<any, any>>,
];

export type executeFunctionWithArgs = (
  schema: GraphQLSchema,
  document: DocumentNode,
  rootValue?: any,
  contextValue?: any,
  variableValues?: Maybe<{ [key: string]: any }>,
  operationName?: Maybe<string>,
  fieldResolver?: Maybe<GraphQLFieldResolver<any, any>>,
  typeResolver?: Maybe<GraphQLTypeResolver<any, any>>,
) => PromiseOrValue<ExecutionResult>;

export interface OtelExecutionArgs {
  schema: GraphQLSchema;
  document: DocumentNode & ObjectWithGraphQLData;
  rootValue?: any;
  contextValue?: any & ObjectWithGraphQLData;
  variableValues?: Maybe<{ [key: string]: any }>;
  operationName?: Maybe<string>;
  fieldResolver?: Maybe<GraphQLFieldResolver<any, any> & OtelPatched>;
  typeResolver?: Maybe<GraphQLTypeResolver<any, any>>;
}

export type executeType = executeFunctionWithObj | executeFunctionWithArgs;

export type parseType = (source: string | Source, options?: ParseOptions) => DocumentNode;

export type validateType = (
  schema: GraphQLSchema,
  documentAST: DocumentNode,
  rules?: ReadonlyArray<ValidationRule>,
  options?: { maxErrors?: number },
  typeInfo?: TypeInfo,
) => ReadonlyArray<GraphQLError>;

export interface GraphQLField {
  span: api.Span;
}

interface OtelGraphQLData {
  source?: any;
  span: api.Span;
  fields: { [key: string]: GraphQLField };
}

export interface ObjectWithGraphQLData {
  [OTEL_GRAPHQL_DATA_SYMBOL]?: OtelGraphQLData;
}

export interface OtelPatched {
  [OTEL_PATCHED_SYMBOL]?: boolean;
}

export interface GraphQLPath {
  prev: GraphQLPath | undefined;
  key: string | number;
  /**
   * optional as it didn't exist yet in ver 14
   */
  typename?: string | undefined;
}
