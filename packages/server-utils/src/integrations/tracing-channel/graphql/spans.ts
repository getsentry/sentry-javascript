/*
 * Span builders for the orchestrion graphql channels (v14–16). They emit the same spans as the native
 * `diagnostics_channel` subscriber (`../../../graphql/graphql-dc-subscriber.ts`, graphql >= 17) by
 * reusing its `utils` and conventions — only the data source differs: here the payloads are the raw
 * arguments of the injected `parse`/`validate`/`execute` calls rather than graphql's native events.
 */

import {
  GRAPHQL_DOCUMENT,
  GRAPHQL_OPERATION_NAME,
  GRAPHQL_OPERATION_TYPE,
  SENTRY_OP,
} from '@sentry/conventions/attributes';
import { WEB_SERVER_GRAPHQL_SPAN_OP } from '@sentry/conventions/op';
import type { Span } from '@sentry/core';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, SPAN_STATUS_ERROR, startInactiveSpan } from '@sentry/core';
import type { GraphqlDocumentNode } from '../../../graphql/utils';
import {
  collectGraphqlDocument,
  getOperationSpanName,
  hasResultErrors,
  renameRootSpanWithOperation,
} from '../../../graphql/utils';
import { GRAPHQL_DATA_SYMBOL, ORIGIN, SPAN_NAME_EXECUTE, SPAN_NAME_PARSE, SPAN_NAME_VALIDATE } from './constants';
import { getOperation, wrapFields, wrapFieldResolver } from './resolvers';
import type {
  DocumentNode,
  GraphQLFieldResolver,
  GraphQLSchema,
  GraphqlResolvedConfig,
  Maybe,
  ObjectWithGraphQLData,
} from './types';

const BASE_ATTRIBUTES = {
  [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
  [SENTRY_OP]: WEB_SERVER_GRAPHQL_SPAN_OP,
} as const;

export function startParseSpan(): Span {
  return startInactiveSpan({ name: SPAN_NAME_PARSE, attributes: { ...BASE_ATTRIBUTES } });
}

/** `documentAST` is the 2nd argument to `validate(schema, documentAST, …)`. */
export function startValidateSpan(documentAST: unknown): Span {
  return startInactiveSpan({
    name: SPAN_NAME_VALIDATE,
    attributes: { ...BASE_ATTRIBUTES, [GRAPHQL_DOCUMENT]: collectGraphqlDocument(documentAST as GraphqlDocumentNode) },
  });
}

/** `result` is validation's return value: a (possibly empty) array of errors. */
export function finalizeValidateSpan(span: Span, result: unknown): void {
  if (Array.isArray(result) && result.length > 0) {
    span.setStatus({ code: SPAN_STATUS_ERROR, message: 'invalid_argument' });
  }
}

/** Positional slots of a `graphql.execute(schema, document, …)` call (v14/v15 legacy signature). */
const enum ExecuteArg {
  SCHEMA = 0,
  DOCUMENT = 1,
  CONTEXT_VALUE = 3,
  OPERATION_NAME = 5,
  FIELD_RESOLVER = 6,
}

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
 * `execute` accepts either a single `ExecutionArgs` object (modern callers, always in v16) or
 * positional args (v14/v15). Both are normalized here; `writeBack` puts mutations onto the correct
 * slot so they reach the real call.
 */
function normalizeExecuteArgs(argsArray: unknown[]): NormalizedExecuteArgs {
  if (argsArray.length >= 2) {
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
 * so the wrapped `execute` call runs with them. Always returns a span; the caller guards against
 * throws (see `safe` in `index.ts`).
 */
export function startExecuteSpan(
  argsArray: unknown[],
  self: unknown,
  config: GraphqlResolvedConfig,
  getConfig: () => GraphqlResolvedConfig,
): Span {
  const args = normalizeExecuteArgs(argsArray);
  const { schema, document } = args;
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

  // v14–16 channels carry only the raw args, so derive the operation from the document (native v17
  // provides `operationType`/`operationName` on the event directly).
  const operation = getOperation(document as DocumentNode, args.operationName);
  const operationType = operation?.operation;
  const operationName = operation?.name?.value ?? args.operationName ?? undefined;

  const span = startInactiveSpan({
    name: getOperationSpanName(operationType, operationName || undefined, SPAN_NAME_EXECUTE),
    attributes: {
      ...BASE_ATTRIBUTES,
      [GRAPHQL_OPERATION_TYPE]: operationType,
      [GRAPHQL_OPERATION_NAME]: operationName || undefined,
      [GRAPHQL_DOCUMENT]: collectGraphqlDocument(document as GraphqlDocumentNode | undefined),
    },
  });

  if (config.useOperationNameForRootSpan && operationType) {
    renameRootSpanWithOperation(span, operationType, operationName || undefined);
  }

  // The resolver proxies read the execute span (and their own bookkeeping) off this symbol.
  contextValue[GRAPHQL_DATA_SYMBOL] = { source: document, span, fields: {} };
  args.writeBack(contextValue, fieldResolver);

  return span;
}

/** `result` is the settled `ExecutionResult`; GraphQL errors surface on `result.errors`, not a throw. */
export function finalizeExecuteSpan(span: Span, result: unknown): void {
  if (hasResultErrors(result)) {
    span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
  }
}
