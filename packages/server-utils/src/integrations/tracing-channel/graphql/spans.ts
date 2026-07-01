/*
 * Span builders for the graphql parse/validate/execute channels. Ported from the private methods of
 * `@opentelemetry/instrumentation-graphql`'s `GraphQLInstrumentation` (upstream 0.66.0), with the OTel
 * tracer replaced by the `@sentry/core` span API. Span names/attributes/origin are preserved so the
 * emitted spans are identical to the OTel integration's.
 */

import type { Span, SpanAttributeValue } from '@sentry/core';
import {
  getRootSpan,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SPAN_STATUS_ERROR,
  spanToJSON,
  startInactiveSpan,
} from '@sentry/core';
import {
  GRAPHQL_OPERATION_NAME,
  GRAPHQL_OPERATION_TYPE,
  SENTRY_GRAPHQL_OPERATION,
} from '@sentry/conventions/attributes';
import { GRAPHQL_DATA_SYMBOL, ORIGIN, SpanNames } from './constants';
import { addSpanSource, getOperation, wrapFields, wrapFieldResolver } from './resolvers';
import type {
  DefinitionNode,
  DocumentNode,
  ExecutionResult,
  GraphQLFieldResolver,
  GraphQLSchema,
  GraphqlResolvedConfig,
  Maybe,
  ObjectWithGraphQLData,
} from './types';

const OPERATION_NOT_SUPPORTED = 'Operation$operationName$not supported';

/** Positional slots of a `graphql.execute(schema, document, …)` call (v14/v15 legacy signature). */
const enum ExecuteArg {
  SCHEMA = 0,
  DOCUMENT = 1,
  CONTEXT_VALUE = 3,
  OPERATION_NAME = 5,
  FIELD_RESOLVER = 6,
}

// --- parse -----------------------------------------------------------------

export function startParseSpan(): Span {
  return startInactiveSpan({ name: SpanNames.PARSE });
}

/** `result` is the parsed `DocumentNode` (present on a successful parse). */
export function finalizeParseSpan(span: Span, result: unknown): void {
  const document = result as (DocumentNode & ObjectWithGraphQLData) | undefined;
  if (!document) {
    return;
  }

  const operation = getOperation(document);
  if (!operation) {
    span.updateName(SpanNames.SCHEMA_PARSE);
  } else if (document.loc) {
    addSpanSource(span, document.loc);
  }
}

// --- validate --------------------------------------------------------------

export function startValidateSpan(): Span {
  return startInactiveSpan({ name: SpanNames.VALIDATE });
}

/** `documentAST` is the second argument to `validate(schema, documentAST, …)`. */
export function finalizeValidateSpan(span: Span, documentAST: unknown): void {
  const document = documentAST as DocumentNode | undefined;
  if (!document?.loc) {
    span.updateName(SpanNames.SCHEMA_VALIDATE);
  }
}

// --- execute ---------------------------------------------------------------

interface NormalizedExecuteArgs {
  schema?: GraphQLSchema;
  document?: DocumentNode;
  contextValue: ObjectWithGraphQLData;
  operationName?: Maybe<string>;
  fieldResolver?: Maybe<GraphQLFieldResolver>;
  /** Writes `contextValue`/`fieldResolver` mutations back to the live channel `arguments`. */
  writeBack: (contextValue: ObjectWithGraphQLData, fieldResolver: Maybe<GraphQLFieldResolver>) => void;
}

/**
 * Reads the execute arguments from the live channel `arguments` array. `execute` accepts either a
 * single `ExecutionArgs` object (modern callers, always in v16) or positional args (v14/v15). Both
 * are normalized here; `writeBack` puts mutations onto the correct slot so they reach the real call.
 */
function normalizeExecuteArgs(argsArray: unknown[]): NormalizedExecuteArgs {
  const isPositional = argsArray.length >= 2;

  if (isPositional) {
    return {
      schema: argsArray[ExecuteArg.SCHEMA] as GraphQLSchema | undefined,
      document: argsArray[ExecuteArg.DOCUMENT] as DocumentNode | undefined,
      contextValue: (argsArray[ExecuteArg.CONTEXT_VALUE] ?? {}) as ObjectWithGraphQLData,
      operationName: argsArray[ExecuteArg.OPERATION_NAME] as Maybe<string>,
      fieldResolver: argsArray[ExecuteArg.FIELD_RESOLVER] as Maybe<GraphQLFieldResolver>,
      writeBack: (contextValue, fieldResolver) => {
        argsArray[ExecuteArg.CONTEXT_VALUE] = contextValue;
        argsArray[ExecuteArg.FIELD_RESOLVER] = fieldResolver;
      },
    };
  }

  const obj = (argsArray[0] ?? {}) as {
    schema?: GraphQLSchema;
    document?: DocumentNode;
    contextValue?: unknown;
    operationName?: Maybe<string>;
    fieldResolver?: Maybe<GraphQLFieldResolver>;
  };
  return {
    schema: obj.schema,
    document: obj.document,
    contextValue: (obj.contextValue ?? {}) as ObjectWithGraphQLData,
    operationName: obj.operationName,
    fieldResolver: obj.fieldResolver,
    writeBack: (contextValue, fieldResolver) => {
      obj.contextValue = contextValue;
      obj.fieldResolver = fieldResolver;
    },
  };
}

/**
 * Opens the execute span and, unless resolver spans are disabled, swaps the schema's field resolvers
 * (and the default field resolver) for span-creating proxies — mutating the live `arguments` in place
 * so the wrapped `execute` call runs with them. Always returns a span (matching the OTel integration,
 * which creates an execute span even for an unsupported/absent operation); the caller guards against
 * throws (see `safe` in `index.ts`).
 */
export function startExecuteSpan(
  argsArray: unknown[],
  self: unknown,
  config: GraphqlResolvedConfig,
  getConfig: () => GraphqlResolvedConfig,
): Span {
  const args = normalizeExecuteArgs(argsArray);
  const { schema, document, operationName } = args;
  let { contextValue, fieldResolver } = args;

  // Skip resolver wrapping when disabled or when a parent execute already set up this context
  // (nested execute reusing the same contextValue).
  const alreadyInstrumented = !!contextValue[GRAPHQL_DATA_SYMBOL];
  if (!config.ignoreResolveSpans && !alreadyInstrumented) {
    const isUsingDefaultResolver = fieldResolver == null;
    const defaultFieldResolver = (self as { defaultFieldResolver?: GraphQLFieldResolver } | undefined)
      ?.defaultFieldResolver;
    const fieldResolverForExecute = fieldResolver ?? defaultFieldResolver;
    if (fieldResolverForExecute) {
      fieldResolver = wrapFieldResolver(getConfig, fieldResolverForExecute, isUsingDefaultResolver);
    }

    if (schema) {
      wrapFields(schema.getQueryType(), getConfig);
      wrapFields(schema.getMutationType(), getConfig);
    }
  }

  const operation = getOperation(document as DocumentNode, operationName);
  const span = createExecuteSpan(operation, document);

  // The resolver proxies read the execute span (and their own bookkeeping) off this symbol.
  contextValue[GRAPHQL_DATA_SYMBOL] = { source: document, span, fields: {} };
  args.writeBack(contextValue, fieldResolver);

  return span;
}

function createExecuteSpan(operation: DefinitionNode | undefined, document: DocumentNode | undefined): Span {
  const span = startInactiveSpan({
    name: SpanNames.EXECUTE,
    attributes: { [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN },
  });

  if (operation) {
    const operationType = operation.operation;
    const operationName = operation.name?.value;

    if (operationType) {
      span.setAttribute(GRAPHQL_OPERATION_TYPE, operationType);
    }

    // Span name MUST be `<type> <name>` when both are available, else `<type>`.
    if (operationName) {
      span.setAttribute(GRAPHQL_OPERATION_NAME, operationName);
      span.updateName(`${operationType} ${operationName}`);
    } else if (operationType) {
      span.updateName(operationType);
    }
  } else {
    const operationName = document ? OPERATION_NOT_SUPPORTED.replace('$operationName$', ' ') : OPERATION_NOT_SUPPORTED;
    span.setAttribute(GRAPHQL_OPERATION_NAME, operationName);
  }

  if (document?.loc) {
    addSpanSource(span, document.loc);
  }

  return span;
}

/**
 * Applies Sentry-specific mutations from the execution result: marks the execute span errored when
 * the result carries errors, and (when enabled) renames the enclosing root span to include the
 * GraphQL operation name(s). `result` is the settled `ExecutionResult`.
 */
export function finalizeExecuteSpan(span: Span, result: unknown, config: GraphqlResolvedConfig): void {
  const executionResult = result as ExecutionResult | undefined;
  if (!executionResult) {
    return;
  }

  if (executionResult.errors?.length && !spanToJSON(span).status) {
    span.setStatus({ code: SPAN_STATUS_ERROR });
  }

  if (!config.useOperationNameForRootSpan) {
    return;
  }

  const attributes = spanToJSON(span).data;
  const operationType = attributes[GRAPHQL_OPERATION_TYPE];
  const operationName = attributes[GRAPHQL_OPERATION_NAME];
  if (!operationType) {
    return;
  }

  const rootSpan = getRootSpan(span);
  const rootSpanAttributes = spanToJSON(rootSpan).data;
  const existingOperations = rootSpanAttributes[SENTRY_GRAPHQL_OPERATION] || [];
  const newOperation = operationName ? `${operationType} ${operationName}` : `${operationType}`;

  if (Array.isArray(existingOperations)) {
    (existingOperations as string[]).push(newOperation);
    rootSpan.setAttribute(SENTRY_GRAPHQL_OPERATION, existingOperations);
  } else if (typeof existingOperations === 'string') {
    rootSpan.setAttribute(SENTRY_GRAPHQL_OPERATION, [existingOperations, newOperation]);
  } else {
    rootSpan.setAttribute(SENTRY_GRAPHQL_OPERATION, newOperation);
  }

  if (!spanToJSON(rootSpan).data['original-description']) {
    rootSpan.setAttribute('original-description', spanToJSON(rootSpan).description);
  }
  // Important for e.g. @sentry/aws-serverless because this would otherwise overwrite the name again.
  rootSpan.updateName(
    `${spanToJSON(rootSpan).data['original-description']} (${getGraphqlOperationNamesFromAttribute(existingOperations)})`,
  );
}

function getGraphqlOperationNamesFromAttribute(attr: SpanAttributeValue): string {
  if (Array.isArray(attr)) {
    const sorted = attr.slice().sort((a, b) => `${a}`.localeCompare(`${b}`));
    if (sorted.length <= 5) {
      return sorted.join(', ');
    }
    return `${sorted.slice(0, 5).join(', ')}, +${sorted.length - 5}`;
  }
  return `${attr}`;
}
