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

import { context, trace } from '@opentelemetry/api';
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
  executeFunctionWithObj,
  executeArgumentsArray,
  executeType,
  parseType,
  validateType,
  OtelExecutionArgs,
  ObjectWithGraphQLData,
  OPERATION_NOT_SUPPORTED,
} from './internal-types';
import {
  addInputVariableAttributes,
  addSpanSource,
  endSpan,
  getOperation,
  isPromise,
  wrapFieldResolver,
  wrapFields,
} from './utils';

import { SDK_VERSION } from '@sentry/core';
import * as api from '@opentelemetry/api';
import { GraphQLInstrumentationConfig, GraphQLInstrumentationParsedConfig } from './types';

const PACKAGE_NAME = '@sentry/instrumentation-graphql';

const DEFAULT_CONFIG: GraphQLInstrumentationParsedConfig = {
  mergeItems: false,
  depth: -1,
  allowValues: false,
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

        return context.with(trace.setSpan(context.active(), span), () => {
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

  private _handleExecutionResult(span: api.Span, err?: Error, result?: PromiseOrValue<ExecutionResult>) {
    const config = this.getConfig();
    if (result === undefined || err) {
      endSpan(span, err);
      return;
    }

    if (isPromise(result)) {
      (result as Promise<ExecutionResult>).then(
        resultData => {
          if (typeof config.responseHook !== 'function') {
            endSpan(span);
            return;
          }
          this._executeResponseHook(span, resultData);
        },
        error => {
          endSpan(span, error);
        },
      );
    } else {
      if (typeof config.responseHook !== 'function') {
        endSpan(span);
        return;
      }
      this._executeResponseHook(span, result as ExecutionResult);
    }
  }

  private _executeResponseHook(span: api.Span, result: ExecutionResult) {
    const { responseHook } = this.getConfig();
    if (!responseHook) {
      return;
    }

    safeExecuteInTheMiddle(
      () => {
        responseHook(span, result);
      },
      err => {
        if (err) {
          this._diag.error('Error running response hook', err);
        }

        endSpan(span, undefined);
      },
      true,
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
    const config = this.getConfig();
    const span = this.tracer.startSpan(SpanNames.PARSE);

    return context.with(trace.setSpan(context.active(), span), () => {
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
              addSpanSource(span, result.loc, config.allowValues);
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
    const span = this.tracer.startSpan(SpanNames.VALIDATE, {});

    return context.with(trace.setSpan(context.active(), span), () => {
      return safeExecuteInTheMiddle<ReadonlyArray<GraphQLError>>(
        () => {
          return original.call(obj, schema, documentAST, rules, options, typeInfo);
        },
        (err, errors) => {
          if (!documentAST.loc) {
            span.updateName(SpanNames.SCHEMA_VALIDATE);
          }
          if (errors && errors.length) {
            span.recordException({
              name: AttributeNames.ERROR_VALIDATION_NAME,
              message: JSON.stringify(errors),
            });
          }
          endSpan(span, err);
        },
      );
    });
  }

  private _createExecuteSpan(operation: DefinitionNode | undefined, processedArgs: ExecutionArgs): api.Span {
    const config = this.getConfig();

    const span = this.tracer.startSpan(SpanNames.EXECUTE, {});
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
      addSpanSource(span, processedArgs.document.loc, config.allowValues);
    }

    if (processedArgs.variableValues && config.allowValues) {
      addInputVariableAttributes(span, processedArgs.variableValues);
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
    fieldResolver = wrapFieldResolver(
      this.tracer,
      () => this.getConfig(),
      fieldResolverForExecute,
      isUsingDefaultResolver,
    );

    if (schema) {
      wrapFields(schema.getQueryType() as any, this.tracer, () => this.getConfig());
      wrapFields(schema.getMutationType() as any, this.tracer, () => this.getConfig());
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
