import type { TracingChannel } from 'node:diagnostics_channel';
import { GRAPHQL_DOCUMENT, GRAPHQL_OPERATION_NAME, GRAPHQL_OPERATION_TYPE } from '@sentry/conventions/attributes';
import { WEB_SERVER_GRAPHQL_SPAN_OP } from '@sentry/conventions/op';
import {
  debug,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SPAN_STATUS_ERROR,
  startInactiveSpan,
} from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build';
import { bindTracingChannelToSpan } from '../tracing-channel';

// Channel names published by graphql >= 17.0.0 (see graphql-js `src/diagnostics.ts`).
// Hardcoded so the subscriber does not have to import graphql — the channels just
// have to be subscribed to before the user's graphql code publishes.
export const GRAPHQL_DC_CHANNEL_PARSE = 'graphql:parse';
export const GRAPHQL_DC_CHANNEL_VALIDATE = 'graphql:validate';
export const GRAPHQL_DC_CHANNEL_EXECUTE = 'graphql:execute';
export const GRAPHQL_DC_CHANNEL_SUBSCRIBE = 'graphql:subscribe';
export const GRAPHQL_DC_CHANNEL_RESOLVE = 'graphql:resolve';

const ORIGIN = 'auto.graphql.diagnostic_channel';

const SPAN_NAME_PARSE = 'graphql.parse';
const SPAN_NAME_VALIDATE = 'graphql.validate';
const SPAN_NAME_EXECUTE = 'graphql.execute';
const SPAN_NAME_SUBSCRIBE = 'graphql.subscribe';
const SPAN_NAME_RESOLVE = 'graphql.resolve';

// Field-level attributes for resolver spans. Not in `@sentry/conventions`; these match the keys the
// vendored OTel instrumentation emits so there is no drift between the two paths.
const GRAPHQL_FIELD_NAME = 'graphql.field.name';
const GRAPHQL_FIELD_PATH = 'graphql.field.path';
const GRAPHQL_FIELD_TYPE = 'graphql.field.type';
const GRAPHQL_PARENT_NAME = 'graphql.parent.name';

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
interface GraphqlDocumentNode {
  loc?: {
    startToken?: GraphqlToken;
    source?: { body?: string };
  };
}

/** Context published on the sync-only `graphql:parse` channel. */
export interface GraphqlParseData {
  source: string | { body?: string };
  result?: GraphqlDocumentNode;
  error?: unknown;
}

/** Context published on the sync-only `graphql:validate` channel. */
export interface GraphqlValidateData {
  document: GraphqlDocumentNode;
  /** Validation errors returned by validation; an empty array means the document is valid. */
  result?: ReadonlyArray<unknown>;
  error?: unknown;
}

/**
 * Context published on the `graphql:execute` and `graphql:subscribe` channels.
 *
 * `result` carries an `ExecutionResult` (or, for subscriptions, an async generator); GraphQL errors
 * collected during execution surface on `result.errors` rather than as the channel's `error`
 * lifecycle event, which only fires on an abrupt throw.
 */
export interface GraphqlOperationData {
  document: GraphqlDocumentNode;
  operationName?: string;
  operationType?: string;
  result?: unknown;
  error?: unknown;
}

/**
 * Context published on the per-field `graphql:resolve` channel.
 *
 * A resolver throw or rejection publishes the `error` lifecycle event here; the same failure also
 * surfaces in the enclosing execution result.
 */
export interface GraphqlResolveData {
  fieldName: string;
  parentType: string;
  fieldType: string;
  fieldPath: string;
  /** Whether the field is handled by graphql's default property resolver (vs. a user resolver). */
  isDefaultResolver: boolean;
  alias?: string;
  args?: unknown;
  result?: unknown;
  error?: unknown;
}

/** Options controlling which graphql channels the subscriber emits spans for. */
export interface GraphqlDiagnosticChannelsOptions {
  /**
   * Do not create spans for resolvers. Resolver spans are per-field and can be very high volume.
   * Defaults to `true`.
   */
  ignoreResolveSpans?: boolean;

  /**
   * When resolver spans are enabled, do not create them for graphql's default property resolver
   * (fields without a user-defined resolver), which are rarely interesting. Defaults to `true`.
   */
  ignoreTrivialResolveSpans?: boolean;
}

/**
 * Platform-provided factory that creates a native tracing channel for the given name. The
 * subscriber binds the span and its lifecycle onto the channel via `bindTracingChannelToSpan`,
 * which propagates the active span through the runtime's async context.
 *
 * Node passes `node:diagnostics_channel`'s `tracingChannel` directly.
 */
export type GraphqlTracingChannelFactory = <T extends object>(name: string) => TracingChannel<T, T>;

let subscribed = false;

/**
 * Subscribe Sentry span handlers to graphql's diagnostics-channel events
 * (`graphql:parse`, `:validate`, `:execute`, `:subscribe`), published by graphql >= 17.0.0.
 *
 * On older graphql versions the channels are never published to, so the subscribers are inert —
 * there is no double-instrumentation against the vendored OTel patcher, which is gated to `< 17`.
 *
 * The per-field `graphql:resolve` channel is only subscribed when `ignoreResolveSpans` is `false`:
 * resolver spans are per-field and can be extremely high-volume, so they are off by default (matching
 * the legacy OTel path). When enabled, `ignoreTrivialResolveSpans` (default `true`) additionally skips
 * graphql's default property resolver.
 *
 * Idempotent: subsequent calls are a no-op.
 */
export function subscribeGraphqlDiagnosticChannels(
  tracingChannel: GraphqlTracingChannelFactory,
  options: GraphqlDiagnosticChannelsOptions = {},
): void {
  if (subscribed) {
    return;
  }
  subscribed = true;

  const ignoreResolveSpans = options.ignoreResolveSpans !== false;
  const ignoreTrivialResolveSpans = options.ignoreTrivialResolveSpans !== false;

  try {
    setupParseChannel(tracingChannel);
    setupValidateChannel(tracingChannel);
    setupOperationChannel(tracingChannel, GRAPHQL_DC_CHANNEL_EXECUTE, SPAN_NAME_EXECUTE);
    setupOperationChannel(tracingChannel, GRAPHQL_DC_CHANNEL_SUBSCRIBE, SPAN_NAME_SUBSCRIBE);

    if (!ignoreResolveSpans) {
      setupResolveChannel(tracingChannel, ignoreTrivialResolveSpans);
    }
  } catch {
    // The factory relies on `node:diagnostics_channel`, which isn't always
    // available. Fail closed; the SDK simply won't emit graphql spans here.
    DEBUG_BUILD && debug.log('GraphQL node:diagnostics_channel subscription failed.');
  }
}

function setupParseChannel(tracingChannel: GraphqlTracingChannelFactory): void {
  bindTracingChannelToSpan(tracingChannel<GraphqlParseData>(GRAPHQL_DC_CHANNEL_PARSE), () =>
    startInactiveSpan({
      name: SPAN_NAME_PARSE,
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: WEB_SERVER_GRAPHQL_SPAN_OP,
      },
    }),
  );
}

function setupValidateChannel(tracingChannel: GraphqlTracingChannelFactory): void {
  bindTracingChannelToSpan(
    tracingChannel<GraphqlValidateData>(GRAPHQL_DC_CHANNEL_VALIDATE),
    data => {
      const document = redactGraphqlDocument(data.document);

      return startInactiveSpan({
        name: SPAN_NAME_VALIDATE,
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: WEB_SERVER_GRAPHQL_SPAN_OP,
          [GRAPHQL_DOCUMENT]: document ?? undefined,
        },
      });
    },
    {
      beforeSpanEnd: (span, data) => {
        // Validation completes normally even when it returns errors, so flag the span here.
        if (Array.isArray(data.result) && data.result.length > 0) {
          span.setStatus({ code: SPAN_STATUS_ERROR, message: 'invalid_argument' });
        }
      },
    },
  );
}

function setupOperationChannel(
  tracingChannel: GraphqlTracingChannelFactory,
  channelName: string,
  fallbackName: string,
): void {
  bindTracingChannelToSpan(
    tracingChannel<GraphqlOperationData>(channelName),
    data => {
      const document = redactGraphqlDocument(data.document);

      return startInactiveSpan({
        name: getOperationSpanName(data, fallbackName),
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: WEB_SERVER_GRAPHQL_SPAN_OP,
          [GRAPHQL_OPERATION_TYPE]: data.operationType ?? undefined,
          [GRAPHQL_OPERATION_NAME]: data.operationName ?? undefined,
          [GRAPHQL_DOCUMENT]: document ?? undefined,
        },
      });
    },
    {
      beforeSpanEnd: (span, data) => {
        // GraphQL errors are returned on `result.errors`, not as a thrown error, so flag the span here.
        if (hasResultErrors(data.result)) {
          span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
        }
      },
    },
  );
}

function setupResolveChannel(tracingChannel: GraphqlTracingChannelFactory, ignoreTrivialResolveSpans: boolean): void {
  bindTracingChannelToSpan(tracingChannel<GraphqlResolveData>(GRAPHQL_DC_CHANNEL_RESOLVE), data => {
    // Returning `undefined` opts this field out: no span is created and the active context is left
    // untouched, so the field still resolves under its parent span.
    if (ignoreTrivialResolveSpans && data.isDefaultResolver) {
      return undefined;
    }

    return startInactiveSpan({
      name: `${SPAN_NAME_RESOLVE} ${data.fieldPath}`,
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: WEB_SERVER_GRAPHQL_SPAN_OP,
        [GRAPHQL_FIELD_NAME]: data.fieldName,
        [GRAPHQL_FIELD_PATH]: data.fieldPath,
        [GRAPHQL_FIELD_TYPE]: data.fieldType,
        [GRAPHQL_PARENT_NAME]: data.parentType,
      },
    });
  });
}

/**
 * Span name follows the GraphQL semantic conventions: `<operation.type> <operation.name>` when both
 * are available, `<operation.type>` when only the type is, otherwise a static fallback.
 */
function getOperationSpanName(data: GraphqlOperationData, fallbackName: string): string {
  const { operationType, operationName } = data;
  if (operationType && operationName) {
    return `${operationType} ${operationName}`;
  }
  if (operationType) {
    return operationType;
  }

  return fallbackName;
}

function hasResultErrors(result: unknown): boolean {
  if (result && typeof result === 'object' && 'errors' in result) {
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
