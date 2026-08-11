import { SENTRY_GRAPHQL_OPERATION } from '@sentry/conventions/attributes';
import type { Span, SpanAttributeValue } from '@sentry/core';
import {
  getClient,
  isObjectLike,
  getRootSpan,
  spanToStreamedSpanJSON,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
} from '@sentry/core';

// Same key the OTel path uses, so renames stay consistent across both.
const ORIGINAL_DESCRIPTION_ATTRIBUTE = 'original-description';

// graphql-js token kinds whose values may carry user data (literal arguments). We
// replace them in the serialized document so raw inline values can never reach
// `graphql.document`. Mirrors the legacy OTel instrumentation's redaction set.
const REDACTED_LITERAL_KINDS = new Set(['Int', 'Float', 'String', 'BlockString']);

/** Minimal shape of a graphql-js lexer token, enough to locate literal spans for redaction. */
interface GraphqlToken {
  kind: string;
  start: number;
  end: number;
  next?: GraphqlToken | null;
}

/** Minimal shape of a parsed graphql-js `DocumentNode`, enough to read its source and tokens. */
export interface GraphqlDocumentNode {
  loc?: {
    startToken?: GraphqlToken;
    source?: { body?: string };
  };
}

/**
 * Rename the enclosing root span to include the operation name(s), e.g. `GET /graphql (query GetUser)`.
 */
export function renameRootSpanWithOperation(span: Span, operationType: string, operationName?: string): void {
  const rootSpan = getRootSpan(span);
  // Nothing to rename if the operation span is itself the root (graphql ran outside any span).
  if (rootSpan === span) {
    return;
  }

  const rootSpanJson = spanToStreamedSpanJSON(rootSpan);

  const newOperation = operationName ? `${operationType} ${operationName}` : operationType;

  // A single operation is stored as a string, multiple as an array.
  const existingOperations = rootSpanJson.attributes[SENTRY_GRAPHQL_OPERATION];
  let operations: string | string[];
  if (Array.isArray(existingOperations)) {
    operations = [...(existingOperations as string[]), newOperation];
  } else if (typeof existingOperations === 'string') {
    operations = [existingOperations, newOperation];
  } else {
    operations = newOperation;
  }
  rootSpan.setAttribute(SENTRY_GRAPHQL_OPERATION, operations);

  // Keep the pre-rename name so repeated renames don't compound.
  const originalDescription =
    (rootSpanJson.attributes[ORIGINAL_DESCRIPTION_ATTRIBUTE] as string | undefined) ?? rootSpanJson.name;
  if (!rootSpanJson.attributes[ORIGINAL_DESCRIPTION_ATTRIBUTE]) {
    rootSpan.setAttribute(ORIGINAL_DESCRIPTION_ATTRIBUTE, originalDescription);
  }

  // `updateName` stamps `source: 'custom'`, so re-set the original source afterwards to preserve it.
  const source = rootSpanJson.attributes[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE];
  rootSpan.updateName(`${originalDescription} (${getGraphqlOperationNamesFromAttribute(operations)})`);
  rootSpan.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, source as SpanAttributeValue);
}

/** Format the accumulated operations for the root span name: up to 5 sorted names, then `+N`. */
function getGraphqlOperationNamesFromAttribute(attr: string | string[]): string {
  if (Array.isArray(attr)) {
    // oxlint-disable-next-line typescript/require-array-sort-compare
    const sorted = attr.slice().sort();
    if (sorted.length <= 5) {
      return sorted.join(', ');
    }

    return `${sorted.slice(0, 5).join(', ')}, +${sorted.length - 5}`;
  }

  return attr;
}

/**
 * Span name follows the GraphQL semantic conventions: `<operation.type> <operation.name>` when both
 * are available, `<operation.type>` when only the type is, otherwise a static fallback.
 */
export function getOperationSpanName(
  operationType: string | undefined,
  operationName: string | undefined,
  fallbackName: string,
): string {
  if (operationType && operationName) {
    return `${operationType} ${operationName}`;
  }
  if (operationType) {
    return operationType;
  }

  return fallbackName;
}

/** Whether a graphql execution result carries GraphQL errors (returned on `result.errors`). */
export function hasResultErrors(result: unknown): boolean {
  if (isObjectLike(result) && 'errors' in result) {
    const errors = (result as { errors?: unknown }).errors;

    return Array.isArray(errors) && errors.length > 0;
  }

  return false;
}

/**
 * Serialize a parsed document into `graphql.document` while redacting every literal argument value:
 * the original source text is preserved verbatim except that string/number literal spans are
 * replaced (`"foo"` -> `"*"`, `42` -> `*`). graphql does not sanitize its channel payload, so this
 * prevents raw inline values (potential PII) from leaving the process. Variable values are never
 * included. Returns `undefined` (rather than throwing) on anything it cannot serialize.
 */
function redactGraphqlDocument(document: GraphqlDocumentNode | undefined): string | undefined {
  const loc = document?.loc;
  const body = loc?.source?.body;
  if (typeof body !== 'string' || !loc?.startToken) {
    return undefined;
  }

  try {
    // Collect literal token spans, then splice them out back-to-front so earlier offsets stay valid.
    const ranges: Array<{ start: number; end: number; kind: string }> = [];
    for (let token: GraphqlToken | null | undefined = loc.startToken; token; token = token.next) {
      if (REDACTED_LITERAL_KINDS.has(token.kind)) {
        ranges.push({ start: token.start, end: token.end, kind: token.kind });
      }
    }

    let out = body;
    // Reverse index loop (not `for...of`) so we splice back-to-front; `i` is bounded by the loop, so
    // `ranges[i]` is always present and the `!` just satisfies `noUncheckedIndexedAccess`.
    for (let i = ranges.length - 1; i >= 0; i--) {
      const { start, end, kind } = ranges[i]!;
      const replacement = kind === 'String' || kind === 'BlockString' ? '"*"' : '*';
      out = out.slice(0, start) + replacement + out.slice(end);
    }

    return out;
  } catch {
    return undefined;
  }
}

/**
 * Returns the redacted document if `dataCollection.graphQL.document` is enabled, `undefined` otherwise.
 */
export function collectGraphqlDocument(document: GraphqlDocumentNode | undefined): string | undefined {
  if (getClient()?.getDataCollectionOptions().graphQL.document !== true) {
    return undefined;
  }
  return redactGraphqlDocument(document);
}
