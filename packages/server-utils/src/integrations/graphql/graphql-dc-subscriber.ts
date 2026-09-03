import type { TracingChannel } from 'node:diagnostics_channel';
import { GRAPHQL_DOCUMENT, GRAPHQL_OPERATION_NAME, GRAPHQL_OPERATION_TYPE } from '@sentry/conventions/attributes';
import { GRAPHQL } from '@sentry/conventions/op';
import {
  getClient,
  hasSpanStreamingEnabled,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SPAN_STATUS_ERROR,
  startInactiveSpan,
} from '@sentry/core';
import { bindTracingChannelToSpan } from '../../tracing-channel';
import {
  GRAPHQL_FIELD_NAME,
  GRAPHQL_FIELD_PATH,
  GRAPHQL_FIELD_TYPE,
  GRAPHQL_PARENT_NAME,
  GRAPHQL_PROCESSING_TYPE,
  ORIGIN,
  PROCESSING_TYPE_EXECUTE,
  PROCESSING_TYPE_PARSE,
  PROCESSING_TYPE_RESOLVE,
  PROCESSING_TYPE_VALIDATE,
  SPAN_NAME_EXECUTE,
  SPAN_NAME_PARSE,
  SPAN_NAME_RESOLVE,
  SPAN_NAME_SUBSCRIBE,
  SPAN_NAME_VALIDATE,
} from './constants';
import type { GraphqlDocumentNode } from './types';
import { collectGraphqlDocument, getOperationSpanName, hasResultErrors, renameRootSpanWithOperation } from './utils';

// Channel names published by graphql >= 17.0.0 (see graphql-js `src/diagnostics.ts`).
// Hardcoded so the subscriber does not have to import graphql — the channels just
// have to be subscribed to before the user's graphql code publishes.
export const GRAPHQL_DC_CHANNEL_PARSE = 'graphql:parse';
export const GRAPHQL_DC_CHANNEL_VALIDATE = 'graphql:validate';
export const GRAPHQL_DC_CHANNEL_EXECUTE = 'graphql:execute';
export const GRAPHQL_DC_CHANNEL_SUBSCRIBE = 'graphql:subscribe';
export const GRAPHQL_DC_CHANNEL_RESOLVE = 'graphql:resolve';

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
export interface GraphQLOptions {
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

  /**
   * Record the operation name(s) on the enclosing root span as `sentry.graphql.operation`, and rename
   * that span to include them, e.g. `GET /graphql` -> `GET /graphql (query GetUser)`. Defaults to
   * `true`; when disabled, neither happens.
   *
   * With span streaming only the attribute is recorded, since the operation name is supplied by the
   * client and would make the root span name high cardinality.
   */
  useOperationNameForRootSpan?: boolean;
}

/**
 * Platform-provided factory that creates a native tracing channel for the given name. The
 * subscriber binds the span and its lifecycle onto the channel via `bindTracingChannelToSpan`,
 * which propagates the active span through the runtime's async context.
 *
 * Node passes `node:diagnostics_channel`'s `tracingChannel` directly.
 */
export type GraphqlTracingChannelFactory = <T extends object>(name: string) => TracingChannel<T, T>;

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
 */
export function subscribeGraphqlDiagnosticChannels(
  tracingChannel: GraphqlTracingChannelFactory,
  options: GraphQLOptions = {},
): void {
  const ignoreResolveSpans = options.ignoreResolveSpans !== false;
  const ignoreTrivialResolveSpans = options.ignoreTrivialResolveSpans !== false;
  const useOperationNameForRootSpan = options.useOperationNameForRootSpan !== false;

  setupParseChannel(tracingChannel);
  setupValidateChannel(tracingChannel);
  setupOperationChannel(tracingChannel, GRAPHQL_DC_CHANNEL_EXECUTE, SPAN_NAME_EXECUTE, useOperationNameForRootSpan);
  setupOperationChannel(tracingChannel, GRAPHQL_DC_CHANNEL_SUBSCRIBE, SPAN_NAME_SUBSCRIBE, useOperationNameForRootSpan);

  if (!ignoreResolveSpans) {
    setupResolveChannel(tracingChannel, ignoreTrivialResolveSpans);
  }
}

function setupParseChannel(tracingChannel: GraphqlTracingChannelFactory): void {
  bindTracingChannelToSpan(tracingChannel<GraphqlParseData>(GRAPHQL_DC_CHANNEL_PARSE), () => {
    const client = getClient();

    return startInactiveSpan({
      name: client && hasSpanStreamingEnabled(client) ? `GraphQL ${PROCESSING_TYPE_PARSE}` : SPAN_NAME_PARSE,
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: GRAPHQL,
        [GRAPHQL_PROCESSING_TYPE]: PROCESSING_TYPE_PARSE,
      },
    });
  });
}

function setupValidateChannel(tracingChannel: GraphqlTracingChannelFactory): void {
  bindTracingChannelToSpan(
    tracingChannel<GraphqlValidateData>(GRAPHQL_DC_CHANNEL_VALIDATE),
    data => {
      const client = getClient();

      return startInactiveSpan({
        name: client && hasSpanStreamingEnabled(client) ? `GraphQL ${PROCESSING_TYPE_VALIDATE}` : SPAN_NAME_VALIDATE,
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: GRAPHQL,
          [GRAPHQL_PROCESSING_TYPE]: PROCESSING_TYPE_VALIDATE,
          [GRAPHQL_DOCUMENT]: collectGraphqlDocument(data.document),
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
  useOperationNameForRootSpan: boolean,
): void {
  bindTracingChannelToSpan(
    tracingChannel<GraphqlOperationData>(channelName),
    data => {
      const client = getClient();
      const streamedName = `GraphQL ${data.operationType || PROCESSING_TYPE_EXECUTE}`;

      const span = startInactiveSpan({
        name:
          client && hasSpanStreamingEnabled(client)
            ? streamedName
            : getOperationSpanName(data.operationType, data.operationName, fallbackName),
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: GRAPHQL,
          [GRAPHQL_PROCESSING_TYPE]: PROCESSING_TYPE_EXECUTE,
          [GRAPHQL_OPERATION_TYPE]: data.operationType,
          [GRAPHQL_OPERATION_NAME]: data.operationName || undefined,
          [GRAPHQL_DOCUMENT]: collectGraphqlDocument(data.document),
        },
      });

      if (useOperationNameForRootSpan && data.operationType) {
        renameRootSpanWithOperation(span, data.operationType, data.operationName);
      }

      return span;
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

    const client = getClient();

    return startInactiveSpan({
      name:
        client && hasSpanStreamingEnabled(client)
          ? `GraphQL ${PROCESSING_TYPE_RESOLVE}`
          : `${SPAN_NAME_RESOLVE} ${data.fieldPath}`,
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: GRAPHQL,
        [GRAPHQL_PROCESSING_TYPE]: PROCESSING_TYPE_RESOLVE,
        [GRAPHQL_FIELD_NAME]: data.fieldName,
        [GRAPHQL_FIELD_PATH]: data.fieldPath,
        [GRAPHQL_FIELD_TYPE]: data.fieldType,
        [GRAPHQL_PARENT_NAME]: data.parentType,
      },
    });
  });
}
