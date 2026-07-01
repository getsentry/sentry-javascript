/*
 * Resolver-span wrapping and GraphQL source extraction. Ported verbatim (minus the OTel tracer) from
 * `@opentelemetry/instrumentation-graphql`'s `utils.ts` (upstream 0.66.0). Span shapes are preserved
 * so resolver spans match the OTel integration's output.
 *
 * These run under the execute channel's `start`: the schema's field resolvers are swapped for
 * span-creating proxies (the "consumer trick" — the transform can't target user resolvers, but
 * `execute` receives the schema, so we mutate it before the wrapped call runs).
 */

import type { Span, SpanAttributes } from '@sentry/core';
import { SPAN_STATUS_ERROR, startInactiveSpan, withActiveSpan } from '@sentry/core';
import { AttributeNames, GRAPHQL_DATA_SYMBOL, GRAPHQL_PATCHED_SYMBOL, SpanNames, TokenKind } from './constants';
import type {
  DefinitionNode,
  DocumentNode,
  GraphQLFieldResolver,
  GraphQLObjectType,
  GraphQLOutputType,
  GraphQLPath,
  GraphQLResolveInfo,
  GraphQLType,
  GraphQLUnionType,
  GraphqlResolvedConfig,
  Location,
  Maybe,
  ObjectWithGraphQLData,
  Patched,
  Token,
} from './types';

const KINDS_TO_REMOVE: string[] = [TokenKind.FLOAT, TokenKind.STRING, TokenKind.INT, TokenKind.BLOCK_STRING];

function isPromise(value: unknown): value is Promise<unknown> {
  return typeof (value as { then?: unknown } | undefined)?.then === 'function';
}

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function addSpanSource(span: Span, loc?: Location, start?: number, end?: number): void {
  span.setAttribute(AttributeNames.SOURCE, getSourceFromLocation(loc, start, end));
}

/**
 * Reconstructs the (redacted) GraphQL source string for a location by walking the token stream, with
 * literal values (strings/numbers) replaced by `*` so query data doesn't leak into span attributes.
 */
export function getSourceFromLocation(loc?: Location, inputStart?: number, inputEnd?: number): string {
  let source = '';

  if (!loc?.startToken) {
    return source;
  }

  const start = typeof inputStart === 'number' ? inputStart : loc.start;
  const end = typeof inputEnd === 'number' ? inputEnd : loc.end;

  let next: Token | null = loc.startToken.next;
  let previousLine = 1;
  while (next) {
    if (next.start < start || next.end > end) {
      next = next.next;
      previousLine = next?.line ?? previousLine;
      continue;
    }

    let value = next.value || next.kind;
    let space = '';
    if (KINDS_TO_REMOVE.indexOf(next.kind) >= 0) {
      value = '*';
    }
    if (next.kind === TokenKind.STRING) {
      value = `"${value}"`;
    }
    if (next.kind === TokenKind.EOF) {
      value = '';
    }

    if (next.line > previousLine) {
      source += '\n'.repeat(next.line - previousLine);
      previousLine = next.line;
      space = ' '.repeat(next.column - 1);
    } else if (next.line === next.prev?.line) {
      space = ' '.repeat(next.start - (next.prev?.end || 0));
    }

    source += space + value;
    next = next.next;
  }

  return source;
}

/**
 * Walks the query/mutation type tree and swaps each field's `resolve` for a span-creating proxy.
 * Idempotent per type via {@link GRAPHQL_PATCHED_SYMBOL}.
 */
export function wrapFields(type: Maybe<GraphQLObjectType & Patched>, getConfig: () => GraphqlResolvedConfig): void {
  if (!type || type[GRAPHQL_PATCHED_SYMBOL]) {
    return;
  }

  type[GRAPHQL_PATCHED_SYMBOL] = true;
  const fields = type.getFields();

  Object.keys(fields).forEach(key => {
    const field = fields[key];
    if (!field) {
      return;
    }

    if (field.resolve) {
      field.resolve = wrapFieldResolver(getConfig, field.resolve);
    }

    if (field.type) {
      for (const unwrappedType of unwrapType(field.type)) {
        wrapFields(unwrappedType, getConfig);
      }
    }
  });
}

export function wrapFieldResolver(
  getConfig: () => GraphqlResolvedConfig,
  fieldResolver: Maybe<GraphQLFieldResolver & Patched>,
  isDefaultResolver = false,
): GraphQLFieldResolver & Patched {
  if ((wrappedFieldResolver as Patched)[GRAPHQL_PATCHED_SYMBOL] || typeof fieldResolver !== 'function') {
    return fieldResolver as GraphQLFieldResolver;
  }

  function wrappedFieldResolver(
    this: unknown,
    source: unknown,
    args: unknown,
    rawContextValue: unknown,
    info: GraphQLResolveInfo,
  ): unknown {
    if (!fieldResolver) {
      return undefined;
    }

    const contextValue = (rawContextValue ?? {}) as ObjectWithGraphQLData;
    const config = getConfig();

    // Mirror graphql's own "trivial resolver" check: a default resolver that just reads a
    // non-function property is not worth a span.
    if (
      config.ignoreTrivialResolveSpans &&
      isDefaultResolver &&
      (isObjectLike(source) || typeof source === 'function')
    ) {
      const property = (source as Record<string, unknown>)[info.fieldName];
      if (typeof property !== 'function') {
        return fieldResolver.call(this, source, args, contextValue, info);
      }
    }

    if (!contextValue[GRAPHQL_DATA_SYMBOL]) {
      return fieldResolver.call(this, source, args, contextValue, info);
    }

    const path = pathToArray(info.path);
    const { field, spanAdded } = createFieldIfNotExists(contextValue, info, path);
    const span = field.span;

    return withActiveSpan(span, () => {
      try {
        const res = fieldResolver.call(this, source, args, contextValue, info);
        if (isPromise(res)) {
          return res.then(
            r => {
              endResolveSpan(span, spanAdded);
              return r;
            },
            (err: Error) => {
              endResolveSpan(span, spanAdded, err);
              throw err;
            },
          );
        }
        endResolveSpan(span, spanAdded);
        return res;
      } catch (err) {
        endResolveSpan(span, spanAdded, err as Error);
        throw err;
      }
    });
  }

  (wrappedFieldResolver as Patched)[GRAPHQL_PATCHED_SYMBOL] = true;
  return wrappedFieldResolver;
}

function endResolveSpan(span: Span, shouldEndSpan: boolean, error?: Error): void {
  if (!shouldEndSpan) {
    return;
  }
  if (error) {
    span.setStatus({ code: SPAN_STATUS_ERROR, message: error.message });
  }
  span.end();
}

function createFieldIfNotExists(
  contextValue: ObjectWithGraphQLData,
  info: GraphQLResolveInfo,
  path: string[],
): { field: { span: Span }; spanAdded: boolean } {
  const existing = getField(contextValue, path);
  if (existing) {
    return { field: existing, spanAdded: false };
  }

  const field = { span: createResolverSpan(contextValue, info, path, getParentFieldSpan(contextValue, path)) };
  addField(contextValue, path, field);
  return { field, spanAdded: true };
}

function createResolverSpan(
  contextValue: ObjectWithGraphQLData,
  info: GraphQLResolveInfo,
  path: string[],
  parentSpan?: Span,
): Span {
  const attributes: SpanAttributes = {
    [AttributeNames.FIELD_NAME]: info.fieldName,
    [AttributeNames.FIELD_PATH]: path.join('.'),
    [AttributeNames.FIELD_TYPE]: info.returnType.toString(),
    [AttributeNames.PARENT_NAME]: info.parentType.name,
  };

  const span = startInactiveSpan({ name: `${SpanNames.RESOLVE} ${path.join('.')}`, attributes, parentSpan });

  const document = contextValue[GRAPHQL_DATA_SYMBOL]?.source;
  const fieldNode = info.fieldNodes.find(node => node.kind === 'Field');
  if (document && fieldNode) {
    addSpanSource(span, document.loc, fieldNode.loc?.start, fieldNode.loc?.end);
  }

  return span;
}

function addField(contextValue: ObjectWithGraphQLData, path: string[], field: { span: Span }): void {
  const data = contextValue[GRAPHQL_DATA_SYMBOL];
  if (data) {
    data.fields[path.join('.')] = field;
  }
}

function getField(contextValue: ObjectWithGraphQLData, path: string[]): { span: Span } | undefined {
  return contextValue[GRAPHQL_DATA_SYMBOL]?.fields[path.join('.')];
}

function getParentFieldSpan(contextValue: ObjectWithGraphQLData, path: string[]): Span | undefined {
  for (let i = path.length - 1; i > 0; i--) {
    const field = getField(contextValue, path.slice(0, i));
    if (field) {
      return field.span;
    }
  }
  return contextValue[GRAPHQL_DATA_SYMBOL]?.span;
}

function pathToArray(path: GraphQLPath): string[] {
  const flattened: string[] = [];
  let curr: GraphQLPath | undefined = path;
  while (curr) {
    flattened.push(String(curr.key));
    curr = curr.prev;
  }
  return flattened.reverse();
}

function unwrapType(type: GraphQLOutputType): readonly (GraphQLObjectType & Patched)[] {
  // The structural index signature widens `ofType` to `unknown`, so narrow it back explicitly.
  if ('ofType' in type && type.ofType) {
    return unwrapType(type.ofType as GraphQLOutputType);
  }
  if (isGraphQLUnionType(type)) {
    return type.getTypes();
  }
  if (isGraphQLObjectType(type)) {
    return [type];
  }
  return [];
}

function isGraphQLUnionType(type: GraphQLType): type is GraphQLUnionType {
  return 'getTypes' in type && typeof type.getTypes === 'function';
}

function isGraphQLObjectType(type: GraphQLType): type is GraphQLObjectType {
  return 'getFields' in type && typeof (type as GraphQLObjectType).getFields === 'function';
}

/**
 * Returns the operation definition for `operationName` (or the first operation) from a parsed
 * document, or `undefined` for schema documents / when no operation is present.
 */
export function getOperation(document: DocumentNode, operationName?: Maybe<string>): DefinitionNode | undefined {
  const definitions: readonly DefinitionNode[] | undefined = document?.definitions;
  if (!definitions || !Array.isArray(definitions)) {
    return undefined;
  }

  const isOperation = (def: DefinitionNode): boolean =>
    !!def?.operation && ['query', 'mutation', 'subscription'].indexOf(def.operation) !== -1;

  if (operationName) {
    return definitions.filter(isOperation).find((def: DefinitionNode) => operationName === def?.name?.value);
  }
  return definitions.find(isOperation);
}
