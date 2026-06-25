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

const ORIGIN = 'auto.graphql.diagnostic_channel';

const SPAN_NAME_PARSE = 'graphql.parse';
const SPAN_NAME_VALIDATE = 'graphql.validate';
const SPAN_NAME_EXECUTE = 'graphql.execute';
const SPAN_NAME_SUBSCRIBE = 'graphql.subscribe';

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
 * Platform-provided factory that creates a native tracing channel for the given name. The
 * subscriber binds the span and its lifecycle onto the channel via `bindTracingChannelToSpan`,
 * which propagates the active span through the runtime's async context.
 *
 * Node passes `node:diagnostics_channel`'s `tracingChannel` directly.
 */
export type GraphqlTracingChannelFactory = <T extends object>(name: string) => TracingChannel<T, T>;

let subscribed = false;
let activeUnbinds: Array<() => void> = [];

/**
 * Subscribe Sentry span handlers to graphql's diagnostics-channel events
 * (`graphql:parse`, `:validate`, `:execute`, `:subscribe`), published by graphql >= 17.0.0.
 *
 * On older graphql versions the channels are never published to, so the subscribers are inert —
 * there is no double-instrumentation against the vendored OTel patcher, which is gated to `< 17`.
 *
 * The per-field `graphql:resolve` channel is intentionally not subscribed: resolver spans are
 * extremely high-volume and the legacy OTel path also omits them by default (`ignoreResolveSpans`).
 *
 * Idempotent: subsequent calls are a no-op.
 */
export function subscribeGraphqlDiagnosticChannels(tracingChannel: GraphqlTracingChannelFactory): void {
  if (subscribed) {
    return;
  }
  subscribed = true;

  try {
    activeUnbinds.push(
      setupParseChannel(tracingChannel),
      setupValidateChannel(tracingChannel),
      setupOperationChannel(tracingChannel, GRAPHQL_DC_CHANNEL_EXECUTE, SPAN_NAME_EXECUTE),
      setupOperationChannel(tracingChannel, GRAPHQL_DC_CHANNEL_SUBSCRIBE, SPAN_NAME_SUBSCRIBE),
    );
  } catch {
    // The factory relies on `node:diagnostics_channel`, which isn't always
    // available. Fail closed; the SDK simply won't emit graphql spans here.
    DEBUG_BUILD && debug.log('GraphQL node:diagnostics_channel subscription failed.');
  }
}

function setupParseChannel(tracingChannel: GraphqlTracingChannelFactory): () => void {
  return bindTracingChannelToSpan(
    tracingChannel<GraphqlParseData>(GRAPHQL_DC_CHANNEL_PARSE),
    () =>
      startInactiveSpan({
        name: SPAN_NAME_PARSE,
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: WEB_SERVER_GRAPHQL_SPAN_OP,
        },
      }),
    { captureError: false },
  ).unbind;
}

function setupValidateChannel(tracingChannel: GraphqlTracingChannelFactory): () => void {
  return bindTracingChannelToSpan(
    tracingChannel<GraphqlValidateData>(GRAPHQL_DC_CHANNEL_VALIDATE),
    data => {
      const document = redactGraphqlDocument(data.document);
      return startInactiveSpan({
        name: SPAN_NAME_VALIDATE,
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: WEB_SERVER_GRAPHQL_SPAN_OP,
          ...(document != null ? { [GRAPHQL_DOCUMENT]: document } : {}),
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
      captureError: false,
    },
  ).unbind;
}

function setupOperationChannel(
  tracingChannel: GraphqlTracingChannelFactory,
  channelName: string,
  fallbackName: string,
): () => void {
  return bindTracingChannelToSpan(
    tracingChannel<GraphqlOperationData>(channelName),
    data => {
      const document = redactGraphqlDocument(data.document);
      return startInactiveSpan({
        name: getOperationSpanName(data, fallbackName),
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: WEB_SERVER_GRAPHQL_SPAN_OP,
          ...(data.operationType != null ? { [GRAPHQL_OPERATION_TYPE]: data.operationType } : {}),
          ...(data.operationName != null ? { [GRAPHQL_OPERATION_NAME]: data.operationName } : {}),
          ...(document != null ? { [GRAPHQL_DOCUMENT]: document } : {}),
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
      // Execution errors are surfaced to the caller in the result; only annotate the span so we
      // don't emit a duplicate error event for every failed operation.
      captureError: false,
    },
  ).unbind;
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

/** Test-only: detach all channel bindings and reset module-local subscribe state. */
export function _resetGraphqlDiagnosticChannelsForTesting(): void {
  activeUnbinds.forEach(unbind => unbind());
  activeUnbinds = [];
  subscribed = false;
}
