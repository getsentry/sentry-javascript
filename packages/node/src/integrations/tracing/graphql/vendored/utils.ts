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

import type {
  DocumentNode,
  GraphQLFieldResolver,
  GraphQLObjectType,
  GraphQLOutputType,
  GraphQLResolveInfo,
  GraphQLType,
  GraphQLUnionType,
  Location,
  Maybe,
  Token,
} from './graphql-types';
import * as api from '@opentelemetry/api';
import { AllowedOperationTypes, SpanNames, TokenKind } from './enum';
import { AttributeNames } from './enums/AttributeNames';
import { OTEL_GRAPHQL_DATA_SYMBOL, OTEL_PATCHED_SYMBOL } from './symbols';
import { GraphQLField, GraphQLPath, ObjectWithGraphQLData, OtelPatched } from './internal-types';
import { GraphQLInstrumentationParsedConfig } from './types';

const OPERATION_VALUES = Object.values(AllowedOperationTypes);

// https://github.com/graphql/graphql-js/blob/main/src/jsutils/isPromise.ts
export const isPromise = (value: any): value is Promise<unknown> => {
  return typeof value?.then === 'function';
};

// https://github.com/graphql/graphql-js/blob/main/src/jsutils/isObjectLike.ts
const isObjectLike = (value: unknown): value is { [key: string]: unknown } => {
  return typeof value == 'object' && value !== null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function addInputVariableAttribute(span: api.Span, key: string, variable: any) {
  if (Array.isArray(variable)) {
    variable.forEach((value, idx) => {
      addInputVariableAttribute(span, `${key}.${idx}`, value);
    });
  } else if (variable instanceof Object) {
    Object.entries(variable).forEach(([nestedKey, value]) => {
      addInputVariableAttribute(span, `${key}.${nestedKey}`, value);
    });
  } else {
    span.setAttribute(`${AttributeNames.VARIABLES}${String(key)}`, variable);
  }
}

export function addInputVariableAttributes(span: api.Span, variableValues: { [key: string]: any }) {
  Object.entries(variableValues).forEach(([key, value]) => {
    addInputVariableAttribute(span, key, value);
  });
}

export function addSpanSource(
  span: api.Span,
  loc?: Location,
  allowValues?: boolean,
  start?: number,
  end?: number,
): void {
  const source = getSourceFromLocation(loc, allowValues, start, end);
  span.setAttribute(AttributeNames.SOURCE, source);
}

function createFieldIfNotExists(
  tracer: api.Tracer,
  getConfig: () => GraphQLInstrumentationParsedConfig,
  contextValue: any,
  info: GraphQLResolveInfo,
  path: string[],
): {
  field: GraphQLField;
  spanAdded: boolean;
} {
  let field = getField(contextValue, path);
  if (field) {
    return { field, spanAdded: false };
  }

  const config = getConfig();
  const parentSpan = config.flatResolveSpans ? getRootSpan(contextValue) : getParentFieldSpan(contextValue, path);

  field = {
    span: createResolverSpan(tracer, getConfig, contextValue, info, path, parentSpan),
  };

  addField(contextValue, path, field);

  return { field, spanAdded: true };
}

function createResolverSpan(
  tracer: api.Tracer,
  getConfig: () => GraphQLInstrumentationParsedConfig,
  contextValue: any,
  info: GraphQLResolveInfo,
  path: string[],
  parentSpan?: api.Span,
): api.Span {
  const attributes: api.SpanAttributes = {
    [AttributeNames.FIELD_NAME]: info.fieldName,
    [AttributeNames.FIELD_PATH]: path.join('.'),
    [AttributeNames.FIELD_TYPE]: info.returnType.toString(),
    [AttributeNames.PARENT_NAME]: info.parentType.name,
  };

  const span = tracer.startSpan(
    `${SpanNames.RESOLVE} ${attributes[AttributeNames.FIELD_PATH]}`,
    {
      attributes,
    },
    parentSpan ? api.trace.setSpan(api.context.active(), parentSpan) : undefined,
  );

  const document = contextValue[OTEL_GRAPHQL_DATA_SYMBOL].source;
  const fieldNode = info.fieldNodes.find(fieldNode => fieldNode.kind === 'Field');

  if (fieldNode) {
    addSpanSource(span, document.loc, getConfig().allowValues, fieldNode.loc?.start, fieldNode.loc?.end);
  }

  return span;
}

export function endSpan(span: api.Span, error?: Error): void {
  if (error) {
    span.recordException(error);
  }
  span.end();
}

export function getOperation(document: DocumentNode, operationName?: Maybe<string>): DefinitionNodeLike | undefined {
  if (!document || !Array.isArray(document.definitions)) {
    return undefined;
  }

  if (operationName) {
    return document.definitions
      .filter(definition => OPERATION_VALUES.indexOf((definition as any)?.operation) !== -1)
      .find(definition => operationName === (definition as any)?.name?.value);
  } else {
    return document.definitions.find(definition => OPERATION_VALUES.indexOf((definition as any)?.operation) !== -1);
  }
}

type DefinitionNodeLike = DocumentNode['definitions'][number];

function addField(contextValue: any, path: string[], field: GraphQLField) {
  return (contextValue[OTEL_GRAPHQL_DATA_SYMBOL].fields[path.join('.')] = field);
}

function getField(contextValue: any, path: string[]): GraphQLField {
  return contextValue[OTEL_GRAPHQL_DATA_SYMBOL].fields[path.join('.')];
}

function getParentFieldSpan(contextValue: any, path: string[]): api.Span {
  for (let i = path.length - 1; i > 0; i--) {
    const field = getField(contextValue, path.slice(0, i));

    if (field) {
      return field.span;
    }
  }

  return getRootSpan(contextValue);
}

function getRootSpan(contextValue: any): api.Span {
  return contextValue[OTEL_GRAPHQL_DATA_SYMBOL].span;
}

function pathToArray(mergeItems: boolean, path: GraphQLPath): string[] {
  const flattened: string[] = [];
  let curr: GraphQLPath | undefined = path;
  while (curr) {
    let key = curr.key;

    if (mergeItems && typeof key === 'number') {
      key = '*';
    }
    flattened.push(String(key));
    curr = curr.prev;
  }
  return flattened.reverse();
}

function repeatBreak(i: number): string {
  return repeatChar('\n', i);
}

function repeatSpace(i: number): string {
  return repeatChar(' ', i);
}

function repeatChar(char: string, to: number): string {
  let text = '';
  for (let i = 0; i < to; i++) {
    text += char;
  }
  return text;
}

const KindsToBeRemoved: string[] = [TokenKind.FLOAT, TokenKind.STRING, TokenKind.INT, TokenKind.BLOCK_STRING];

export function getSourceFromLocation(
  loc?: Location,
  allowValues = false,
  inputStart?: number,
  inputEnd?: number,
): string {
  let source = '';

  if (loc?.startToken) {
    const start = typeof inputStart === 'number' ? inputStart : loc.start;
    const end = typeof inputEnd === 'number' ? inputEnd : loc.end;

    let next: Token | null = loc.startToken.next;
    let previousLine: number | undefined = 1;
    while (next) {
      if (next.start < start) {
        next = next.next;
        previousLine = next?.line;
        continue;
      }
      if (next.end > end) {
        next = next.next;
        previousLine = next?.line;
        continue;
      }
      let value = next.value || next.kind;
      let space = '';
      if (!allowValues && KindsToBeRemoved.indexOf(next.kind) >= 0) {
        // value = repeatChar('*', value.length);
        value = '*';
      }
      if (next.kind === TokenKind.STRING) {
        value = `"${value}"`;
      }
      if (next.kind === TokenKind.EOF) {
        value = '';
      }
      if (next.line > previousLine!) {
        source += repeatBreak(next.line - previousLine!);
        previousLine = next.line;
        space = repeatSpace(next.column - 1);
      } else {
        if (next.line === next.prev?.line) {
          space = repeatSpace(next.start - (next.prev?.end || 0));
        }
      }
      source += space + value;
      if (next) {
        next = next.next!;
      }
    }
  }

  return source;
}

export function wrapFields(
  type: Maybe<GraphQLObjectType & OtelPatched>,
  tracer: api.Tracer,
  getConfig: () => GraphQLInstrumentationParsedConfig,
): void {
  if (!type || (type as any)[OTEL_PATCHED_SYMBOL]) {
    return;
  }
  const fields = type.getFields();

  (type as any)[OTEL_PATCHED_SYMBOL] = true;

  Object.keys(fields).forEach(key => {
    const field = fields[key];

    if (!field) {
      return;
    }

    if (field.resolve) {
      field.resolve = wrapFieldResolver(tracer, getConfig, field.resolve);
    }

    if (field.type) {
      const unwrappedTypes = unwrapType(field.type);
      for (const unwrappedType of unwrappedTypes) {
        wrapFields(unwrappedType as any, tracer, getConfig);
      }
    }
  });
}

function unwrapType(type: GraphQLOutputType): readonly GraphQLObjectType[] {
  // unwrap wrapping types (non-nullable and list types)
  if ('ofType' in type) {
    return unwrapType(type.ofType);
  }

  // unwrap union types
  if (isGraphQLUnionType(type)) {
    return type.getTypes();
  }

  // return object types
  if (isGraphQLObjectType(type)) {
    return [type];
  }

  return [];
}

function isGraphQLUnionType(type: GraphQLType): type is GraphQLUnionType {
  return 'getTypes' in type && typeof type.getTypes === 'function';
}

function isGraphQLObjectType(type: GraphQLType): type is GraphQLObjectType {
  return 'getFields' in type && typeof type.getFields === 'function';
}

const handleResolveSpanError = (resolveSpan: api.Span, err: any, shouldEndSpan: boolean) => {
  if (!shouldEndSpan) {
    return;
  }
  resolveSpan.recordException(err);
  resolveSpan.setStatus({
    code: api.SpanStatusCode.ERROR,
    message: err.message,
  });
  resolveSpan.end();
};

const handleResolveSpanSuccess = (resolveSpan: api.Span, shouldEndSpan: boolean) => {
  if (!shouldEndSpan) {
    return;
  }
  resolveSpan.end();
};

export function wrapFieldResolver<TSource = any, TContext = any, TArgs = any>(
  tracer: api.Tracer,
  getConfig: () => GraphQLInstrumentationParsedConfig,
  fieldResolver: Maybe<GraphQLFieldResolver<TSource, TContext, TArgs> & OtelPatched>,
  isDefaultResolver = false,
): GraphQLFieldResolver<TSource, TContext & ObjectWithGraphQLData, TArgs> & OtelPatched {
  if ((wrappedFieldResolver as OtelPatched)[OTEL_PATCHED_SYMBOL] || typeof fieldResolver !== 'function') {
    return fieldResolver!;
  }

  function wrappedFieldResolver(
    this: GraphQLFieldResolver<TSource, TContext, TArgs>,
    source: TSource,
    args: TArgs,
    contextValue: TContext & ObjectWithGraphQLData,
    info: GraphQLResolveInfo,
  ) {
    if (!fieldResolver) {
      return undefined;
    }
    const config = getConfig();

    // follows what graphql is doing to decide if this is a trivial resolver
    // for which we don't need to create a resolve span
    if (
      config.ignoreTrivialResolveSpans &&
      isDefaultResolver &&
      (isObjectLike(source) || typeof source === 'function')
    ) {
      const property = (source as any)[info.fieldName];
      // a function execution is not trivial and should be recorder.
      // property which is not a function is just a value and we don't want a "resolve" span for it
      if (typeof property !== 'function') {
        return fieldResolver.call(this, source, args, contextValue, info);
      }
    }

    if (!contextValue[OTEL_GRAPHQL_DATA_SYMBOL]) {
      return fieldResolver.call(this, source, args, contextValue, info);
    }
    const path = pathToArray(config.mergeItems, info && info.path);
    const depth = path.filter((item: any) => typeof item === 'string').length;

    let span: api.Span;
    let shouldEndSpan = false;
    if (config.depth >= 0 && config.depth < depth) {
      span = getParentFieldSpan(contextValue, path);
    } else {
      const { field, spanAdded } = createFieldIfNotExists(tracer, getConfig, contextValue, info, path);
      span = field.span;
      shouldEndSpan = spanAdded;
    }

    return api.context.with(api.trace.setSpan(api.context.active(), span), () => {
      try {
        const res = fieldResolver.call(this, source, args, contextValue, info);
        if (isPromise(res)) {
          return res.then(
            (r: any) => {
              handleResolveSpanSuccess(span, shouldEndSpan);
              return r;
            },
            (err: Error) => {
              handleResolveSpanError(span, err, shouldEndSpan);
              throw err;
            },
          );
        } else {
          handleResolveSpanSuccess(span, shouldEndSpan);
          return res;
        }
      } catch (err: any) {
        handleResolveSpanError(span, err, shouldEndSpan);
        throw err;
      }
    });
  }

  (wrappedFieldResolver as OtelPatched)[OTEL_PATCHED_SYMBOL] = true;

  return wrappedFieldResolver;
}
