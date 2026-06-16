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
 * - Types from `graphql` package inlined as simplified interfaces
 * - Minor TypeScript strictness adjustments
 * - Span lifecycle migrated from the OpenTelemetry tracer to the @sentry/core span API
 * - `auto.graphql.otel.graphql` origin baked into the execute span (previously set via a Sentry responseHook)
 * - The generic `responseHook` config was removed; its Sentry-specific logic (error status + root span renaming
 *   via `useOperationNameForRootSpan`) is now applied directly when the execution result is handled
 */

/* oxlint-disable max-lines */

import {
  isWrapped,
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  safeExecuteInTheMiddle,
} from '@opentelemetry/instrumentation';
import { InstrumentationNodeModuleFile } from '../../InstrumentationNodeModuleFile';
import type {
  DefinitionNode,
  DocumentNode,
  ExecutionArgs,
  ExecutionResult,
  GraphQLError,
  GraphQLFieldResolver,
  GraphQLSchema,
  GraphQLTypeResolver,
  OperationDefinitionNode,
  ParseOptions,
  PromiseOrValue,
  Source,
  TypeInfo,
  ValidationRule,
} from './graphql-types';
import type { Maybe } from './graphql-types';
import { SpanNames } from './enum';
import { AttributeNames } from './enums/AttributeNames';
import { OTEL_GRAPHQL_DATA_SYMBOL } from './symbols';

import {
  type executeFunctionWithObj,
  type executeArgumentsArray,
  type executeType,
  type parseType,
  type validateType,
  type OtelExecutionArgs,
  type ObjectWithGraphQLData,
  OPERATION_NOT_SUPPORTED,
} from './internal-types';
import { addSpanSource, endSpan, getOperation, isPromise, wrapFieldResolver, wrapFields } from './utils';

import type { Span, SpanAttributeValue } from '@sentry/core';
import {
  getRootSpan,
  SDK_VERSION,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SPAN_STATUS_ERROR,
  spanToJSON,
  startInactiveSpan,
  withActiveSpan,
} from '@sentry/core';
import { SEMANTIC_ATTRIBUTE_SENTRY_GRAPHQL_OPERATION } from '@sentry/opentelemetry';
import type { GraphQLInstrumentationConfig, GraphQLInstrumentationParsedConfig } from './types';

const PACKAGE_NAME = '@sentry/instrumentation-graphql';

const ORIGIN = 'auto.graphql.otel.graphql';

const DEFAULT_CONFIG: GraphQLInstrumentationParsedConfig = {
  ignoreResolveSpans: false,
};

const supportedVersions = ['>=14.0.0 <17'];

export class GraphQLInstrumentation extends InstrumentationBase<GraphQLInstrumentationParsedConfig> {
  constructor(config: GraphQLInstrumentationConfig = {}) {
    super(PACKAGE_NAME, SDK_VERSION, { ...DEFAULT_CONFIG, ...config });
  }

  override setConfig(config: GraphQLInstrumentationConfig = {}) {
    super.setConfig({ ...DEFAULT_CONFIG, ...config });
  }

  protected init() {
    const module = new InstrumentationNodeModuleDefinition('graphql', supportedVersions);
    module.files.push(this._addPatchingExecute());
    module.files.push(this._addPatchingParser());
    module.files.push(this._addPatchingValidate());

    return module;
  }

  private _addPatchingExecute(): InstrumentationNodeModuleFile {
    return new InstrumentationNodeModuleFile(
      'graphql/execution/execute.js',
      supportedVersions,
      // cannot make it work with appropriate type as execute function has 2
      //types and/cannot import function but only types
      (moduleExports: any) => {
        if (isWrapped(moduleExports.execute)) {
          this._unwrap(moduleExports, 'execute');
        }
        this._wrap(moduleExports, 'execute', this._patchExecute(moduleExports.defaultFieldResolver));
        return moduleExports;
      },
      moduleExports => {
        if (moduleExports) {
          this._unwrap(moduleExports, 'execute');
        }
      },
    );
  }

  private _addPatchingParser(): InstrumentationNodeModuleFile {
    return new InstrumentationNodeModuleFile(
      'graphql/language/parser.js',
      supportedVersions,
      (moduleExports: { parse: parseType; [key: string]: any }) => {
        if (isWrapped(moduleExports.parse)) {
          this._unwrap(moduleExports, 'parse');
        }
        this._wrap(moduleExports, 'parse', this._patchParse());
        return moduleExports;
      },
      (moduleExports: { parse: parseType; [key: string]: any }) => {
        if (moduleExports) {
          this._unwrap(moduleExports, 'parse');
        }
      },
    );
  }

  private _addPatchingValidate(): InstrumentationNodeModuleFile {
    return new InstrumentationNodeModuleFile(
      'graphql/validation/validate.js',
      supportedVersions,
      moduleExports => {
        if (isWrapped(moduleExports.validate)) {
          this._unwrap(moduleExports, 'validate');
        }
        this._wrap(moduleExports, 'validate', this._patchValidate());
        return moduleExports;
      },
      moduleExports => {
        if (moduleExports) {
          this._unwrap(moduleExports, 'validate');
        }
      },
    );
  }

  private _patchExecute(defaultFieldResolved: GraphQLFieldResolver<any, any>): (original: executeType) => executeType {
    const instrumentation = this;
    return function execute(original) {
      return function patchExecute(this: executeType): PromiseOrValue<ExecutionResult> {
        let processedArgs: OtelExecutionArgs;

        // case when apollo server is used for example
        if (arguments.length >= 2) {
          const args = arguments as unknown as executeArgumentsArray;
          processedArgs = instrumentation._wrapExecuteArgs(
            args[0],
            args[1],
            args[2],
            args[3],
            args[4],
            args[5],
            args[6],
            args[7],
            defaultFieldResolved,
          );
        } else {
          const args = arguments[0] as ExecutionArgs;
          processedArgs = instrumentation._wrapExecuteArgs(
            args.schema,
            args.document,
            args.rootValue,
            args.contextValue,
            args.variableValues,
            args.operationName,
            args.fieldResolver,
            args.typeResolver,
            defaultFieldResolved,
          );
        }

        const operation = getOperation(processedArgs.document, processedArgs.operationName);

        const span = instrumentation._createExecuteSpan(operation, processedArgs);

        processedArgs.contextValue[OTEL_GRAPHQL_DATA_SYMBOL] = {
          source: processedArgs.document
            ? processedArgs.document || (processedArgs.document as ObjectWithGraphQLData)[OTEL_GRAPHQL_DATA_SYMBOL]
            : undefined,
          span,
          fields: {},
        };

        return withActiveSpan(span, () => {
          return safeExecuteInTheMiddle<PromiseOrValue<ExecutionResult>>(
            () => {
              return (original as executeFunctionWithObj).apply(this, [processedArgs]);
            },
            (err, result) => {
              instrumentation._handleExecutionResult(span, err, result);
            },
          );
        });
      };
    };
  }

  private _handleExecutionResult(span: Span, err?: Error, result?: PromiseOrValue<ExecutionResult>) {
    if (result === undefined || err) {
      endSpan(span, err);
      return;
    }

    if (isPromise(result)) {
      result.then(
        resultData => {
          this._updateSpanFromResult(span, resultData);
          endSpan(span);
        },
        error => {
          endSpan(span, error);
        },
      );
    } else {
      this._updateSpanFromResult(span, result);
      endSpan(span);
    }
  }

  /**
   * Applies Sentry-specific span mutations based on the GraphQL execution result:
   * - Marks the execute span as errored if the result contains errors (and no status was set yet)
   * - Optionally renames the containing root span to include the GraphQL operation name(s)
   */
  private _updateSpanFromResult(span: Span, result: ExecutionResult): void {
    // We want to ensure spans are marked as errored if there are errors in the result
    // We only do that if the span is not already marked with a status
    if (result.errors?.length && !spanToJSON(span).status) {
      span.setStatus({ code: SPAN_STATUS_ERROR });
    }

    if (!this.getConfig().useOperationNameForRootSpan) {
      return;
    }

    const attributes = spanToJSON(span).data;

    // If operation.name is not set, we fall back to use operation.type only
    const operationType = attributes[AttributeNames.OPERATION_TYPE];
    const operationName = attributes[AttributeNames.OPERATION_NAME];

    if (!operationType) {
      return;
    }

    const rootSpan = getRootSpan(span);
    const rootSpanAttributes = spanToJSON(rootSpan).data;

    const existingOperations = rootSpanAttributes[SEMANTIC_ATTRIBUTE_SENTRY_GRAPHQL_OPERATION] || [];

    const newOperation = operationName ? `${operationType} ${operationName}` : `${operationType}`;

    // We keep track of each operation on the root span
    // This can either be a string, or an array of strings (if there are multiple operations)
    if (Array.isArray(existingOperations)) {
      (existingOperations as string[]).push(newOperation);
      rootSpan.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_GRAPHQL_OPERATION, existingOperations);
    } else if (typeof existingOperations === 'string') {
      rootSpan.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_GRAPHQL_OPERATION, [existingOperations, newOperation]);
    } else {
      rootSpan.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_GRAPHQL_OPERATION, newOperation);
    }

    if (!spanToJSON(rootSpan).data['original-description']) {
      rootSpan.setAttribute('original-description', spanToJSON(rootSpan).description);
    }
    // Important for e.g. @sentry/aws-serverless because this would otherwise overwrite the name again
    rootSpan.updateName(
      `${spanToJSON(rootSpan).data['original-description']} (${getGraphqlOperationNamesFromAttribute(
        existingOperations,
      )})`,
    );
  }

  private _patchParse(): (original: parseType) => parseType {
    const instrumentation = this;
    return function parse(original) {
      return function patchParse(this: parseType, source: string | Source, options?: ParseOptions): DocumentNode {
        return instrumentation._parse(this, original, source, options);
      };
    };
  }

  private _patchValidate(): (original: validateType) => validateType {
    const instrumentation = this;
    return function validate(original: validateType) {
      return function patchValidate(
        this: validateType,
        schema: GraphQLSchema,
        documentAST: DocumentNode,
        rules?: ReadonlyArray<ValidationRule>,
        options?: { maxErrors?: number },
        typeInfo?: TypeInfo,
      ): ReadonlyArray<GraphQLError> {
        return instrumentation._validate(this, original, schema, documentAST, rules, typeInfo, options);
      };
    };
  }

  private _parse(obj: parseType, original: parseType, source: string | Source, options?: ParseOptions): DocumentNode {
    const span = startInactiveSpan({ name: SpanNames.PARSE });

    return withActiveSpan(span, () => {
      return safeExecuteInTheMiddle<DocumentNode & ObjectWithGraphQLData>(
        () => {
          return original.call(obj, source, options);
        },
        (err, result) => {
          if (result) {
            const operation = getOperation(result);
            if (!operation) {
              span.updateName(SpanNames.SCHEMA_PARSE);
            } else if (result.loc) {
              addSpanSource(span, result.loc);
            }
          }
          endSpan(span, err);
        },
      );
    });
  }

  private _validate(
    obj: validateType,
    original: validateType,
    schema: GraphQLSchema,
    documentAST: DocumentNode,
    rules?: ReadonlyArray<ValidationRule>,
    typeInfo?: TypeInfo,
    options?: { maxErrors?: number },
  ): ReadonlyArray<GraphQLError> {
    const span = startInactiveSpan({ name: SpanNames.VALIDATE });

    return withActiveSpan(span, () => {
      return safeExecuteInTheMiddle<ReadonlyArray<GraphQLError>>(
        () => {
          return original.call(obj, schema, documentAST, rules, options, typeInfo);
        },
        (err, _errors) => {
          if (!documentAST.loc) {
            span.updateName(SpanNames.SCHEMA_VALIDATE);
          }
          endSpan(span, err);
        },
      );
    });
  }

  private _createExecuteSpan(operation: DefinitionNode | undefined, processedArgs: ExecutionArgs): Span {
    const span = startInactiveSpan({
      name: SpanNames.EXECUTE,
      attributes: { [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN },
    });
    if (operation) {
      const { operation: operationType, name: nameNode } = operation as OperationDefinitionNode;

      span.setAttribute(AttributeNames.OPERATION_TYPE, operationType);

      const operationName = nameNode?.value;

      // https://opentelemetry.io/docs/reference/specification/trace/semantic_conventions/instrumentation/graphql/
      // > The span name MUST be of the format <graphql.operation.type> <graphql.operation.name> provided that graphql.operation.type and graphql.operation.name are available.
      // > If graphql.operation.name is not available, the span SHOULD be named <graphql.operation.type>.
      if (operationName) {
        span.setAttribute(AttributeNames.OPERATION_NAME, operationName);
        span.updateName(`${operationType} ${operationName}`);
      } else {
        span.updateName(operationType);
      }
    } else {
      let operationName = ' ';
      if (processedArgs.operationName) {
        operationName = ` "${processedArgs.operationName}" `;
      }
      operationName = OPERATION_NOT_SUPPORTED.replace('$operationName$', operationName);
      span.setAttribute(AttributeNames.OPERATION_NAME, operationName);
    }

    if (processedArgs.document?.loc) {
      addSpanSource(span, processedArgs.document.loc);
    }

    return span;
  }

  private _wrapExecuteArgs(
    schema: GraphQLSchema,
    document: DocumentNode,
    rootValue: any,
    contextValue: any,
    variableValues: Maybe<{ [key: string]: any }>,
    operationName: Maybe<string>,
    fieldResolver: Maybe<GraphQLFieldResolver<any, any>>,
    typeResolver: Maybe<GraphQLTypeResolver<any, any>>,
    defaultFieldResolved: GraphQLFieldResolver<any, any>,
  ): OtelExecutionArgs {
    if (!contextValue) {
      // oxlint-disable-next-line no-param-reassign
      contextValue = {};
    }

    if (contextValue[OTEL_GRAPHQL_DATA_SYMBOL] || this.getConfig().ignoreResolveSpans) {
      return {
        schema,
        document,
        rootValue,
        contextValue,
        variableValues,
        operationName,
        fieldResolver,
        typeResolver,
      };
    }

    const isUsingDefaultResolver = fieldResolver == null;
    // follows graphql implementation here:
    // https://github.com/graphql/graphql-js/blob/0b7daed9811731362c71900e12e5ea0d1ecc7f1f/src/execution/execute.ts#L494
    const fieldResolverForExecute = fieldResolver ?? defaultFieldResolved;
    // oxlint-disable-next-line no-param-reassign
    fieldResolver = wrapFieldResolver(() => this.getConfig(), fieldResolverForExecute, isUsingDefaultResolver);

    if (schema) {
      wrapFields(schema.getQueryType() as any, () => this.getConfig());
      wrapFields(schema.getMutationType() as any, () => this.getConfig());
    }

    return {
      schema,
      document,
      rootValue,
      contextValue,
      variableValues,
      operationName,
      fieldResolver,
      typeResolver,
    };
  }
}

// copy from packages/opentelemetry/utils
function getGraphqlOperationNamesFromAttribute(attr: SpanAttributeValue): string {
  if (Array.isArray(attr)) {
    // oxlint-disable-next-line typescript/require-array-sort-compare
    const sorted = attr.slice().sort();

    // Up to 5 items, we just add all of them
    if (sorted.length <= 5) {
      return sorted.join(', ');
    } else {
      // Else, we add the first 5 and the diff of other operations
      return `${sorted.slice(0, 5).join(', ')}, +${sorted.length - 5}`;
    }
  }

  return `${attr}`;
}
