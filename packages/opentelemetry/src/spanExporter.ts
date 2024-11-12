import type { Span } from '@opentelemetry/api';
import { SpanKind } from '@opentelemetry/api';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { ATTR_HTTP_RESPONSE_STATUS_CODE, SEMATTRS_HTTP_STATUS_CODE } from '@opentelemetry/semantic-conventions';
import {
  captureEvent,
  getCapturedScopesOnSpan,
  getDynamicSamplingContextFromSpan,
  getMetricSummaryJsonForSpan,
  timedEventsToMeasurements,
} from '@sentry/core';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  getStatusMessage,
  spanTimeInputToSeconds,
} from '@sentry/core';
import type { SpanJSON, SpanOrigin, TraceContext, TransactionEvent, TransactionSource } from '@sentry/types';
import { dropUndefinedKeys, logger } from '@sentry/utils';
import { SENTRY_TRACE_STATE_PARENT_SPAN_ID } from './constants';

import { DEBUG_BUILD } from './debug-build';
import { SEMANTIC_ATTRIBUTE_SENTRY_PARENT_IS_REMOTE } from './semanticAttributes';
import { getRequestSpanData } from './utils/getRequestSpanData';
import type { SpanNode } from './utils/groupSpansWithParents';
import { getLocalParentId } from './utils/groupSpansWithParents';
import { groupSpansWithParents } from './utils/groupSpansWithParents';
import { mapStatus } from './utils/mapStatus';
import { parseSpanDescription } from './utils/parseSpanDescription';

type SpanNodeCompleted = SpanNode & { span: ReadableSpan };

const MAX_SPAN_COUNT = 1000;
const DEFAULT_TIMEOUT = 300; // 5 min

/**
 * A Sentry-specific exporter that converts OpenTelemetry Spans to Sentry Spans & Transactions.
 */
export class SentrySpanExporter {
  private _flushTimeout: ReturnType<typeof setTimeout> | undefined;
  private _finishedSpans: ReadableSpan[];
  private _timeout: number;

  public constructor(options?: { timeout?: number }) {
    this._finishedSpans = [];
    this._timeout = options?.timeout || DEFAULT_TIMEOUT;
  }

  /** Export a single span. */
  public export(span: ReadableSpan): void {
    this._finishedSpans.push(span);

    // If the span has a local parent ID, we don't need to export anything just yet
    if (getLocalParentId(span)) {
      const openSpanCount = this._finishedSpans.length;
      DEBUG_BUILD && logger.log(`SpanExporter has ${openSpanCount} unsent spans remaining`);
      this._cleanupOldSpans();
      return;
    }

    this._clearTimeout();

    // If we got a parent span, we try to send the span tree
    // Wait a tick for this, to ensure we avoid race conditions
    this._flushTimeout = setTimeout(() => {
      this.flush();
    }, 1);
  }

  /** Try to flush any pending spans immediately. */
  public flush(): void {
    this._clearTimeout();

    const openSpanCount = this._finishedSpans.length;

    const remainingSpans = maybeSend(this._finishedSpans);

    const remainingOpenSpanCount = remainingSpans.length;
    const sentSpanCount = openSpanCount - remainingOpenSpanCount;

    DEBUG_BUILD &&
      logger.log(`SpanExporter exported ${sentSpanCount} spans, ${remainingOpenSpanCount} unsent spans remaining`);

    this._cleanupOldSpans(remainingSpans);
  }

  /** Clear the exporter. */
  public clear(): void {
    this._finishedSpans = [];
    this._clearTimeout();
  }

  /** Clear the flush timeout. */
  private _clearTimeout(): void {
    if (this._flushTimeout) {
      clearTimeout(this._flushTimeout);
      this._flushTimeout = undefined;
    }
  }

  /**
   * Remove any span that is older than 5min.
   * We do this to avoid leaking memory.
   */
  private _cleanupOldSpans(spans = this._finishedSpans): void {
    const currentTimeSeconds = Date.now() / 1000;
    this._finishedSpans = spans.filter(span => {
      const shouldDrop = shouldCleanupSpan(span, currentTimeSeconds, this._timeout);
      DEBUG_BUILD &&
        shouldDrop &&
        logger.log(
          `SpanExporter dropping span ${span.name} (${
            span.spanContext().spanId
          }) because it is pending for more than 5 minutes.`,
        );
      return !shouldDrop;
    });
  }
}

/**
 * Send the given spans, but only if they are part of a finished transaction.
 *
 * Returns the unsent spans.
 * Spans remain unsent when their parent span is not yet finished.
 * This will happen regularly, as child spans are generally finished before their parents.
 * But it _could_ also happen because, for whatever reason, a parent span was lost.
 * In this case, we'll eventually need to clean this up.
 */
function maybeSend(spans: ReadableSpan[]): ReadableSpan[] {
  const grouped = groupSpansWithParents(spans);
  const remaining = new Set(grouped);

  const rootNodes = getCompletedRootNodes(grouped);

  rootNodes.forEach(root => {
    remaining.delete(root);
    const span = root.span;
    const transactionEvent = createTransactionForOtelSpan(span);

    // We'll recursively add all the child spans to this array
    const spans = transactionEvent.spans || [];

    root.children.forEach(child => {
      createAndFinishSpanForOtelSpan(child, spans, remaining);
    });

    // spans.sort() mutates the array, but we do not use this anymore after this point
    // so we can safely mutate it here
    transactionEvent.spans =
      spans.length > MAX_SPAN_COUNT
        ? spans.sort((a, b) => a.start_timestamp - b.start_timestamp).slice(0, MAX_SPAN_COUNT)
        : spans;

    const measurements = timedEventsToMeasurements(span.events);
    if (measurements) {
      transactionEvent.measurements = measurements;
    }

    captureEvent(transactionEvent);
  });

  return Array.from(remaining)
    .map(node => node.span)
    .filter((span): span is ReadableSpan => !!span);
}

function nodeIsCompletedRootNode(node: SpanNode): node is SpanNodeCompleted {
  return !!node.span && !node.parentNode;
}

function getCompletedRootNodes(nodes: SpanNode[]): SpanNodeCompleted[] {
  return nodes.filter(nodeIsCompletedRootNode);
}

function shouldCleanupSpan(span: ReadableSpan, currentTimeSeconds: number, maxStartTimeOffsetSeconds: number): boolean {
  const cutoff = currentTimeSeconds - maxStartTimeOffsetSeconds;
  return spanTimeInputToSeconds(span.startTime) < cutoff;
}

function parseSpan(span: ReadableSpan): { op?: string; origin?: SpanOrigin; source?: TransactionSource } {
  const attributes = span.attributes;

  const origin = attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN] as SpanOrigin | undefined;
  const op = attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP] as string | undefined;
  const source = attributes[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE] as TransactionSource | undefined;

  return { origin, op, source };
}

function createTransactionForOtelSpan(span: ReadableSpan): TransactionEvent {
  const { op, description, data, origin = 'manual', source } = getSpanData(span);
  const capturedSpanScopes = getCapturedScopesOnSpan(span as unknown as Span);

  const sampleRate = span.attributes[SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE] as number | undefined;

  const attributes = dropUndefinedKeys({
    [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: source,
    [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: sampleRate,
    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: op,
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: origin,
    ...data,
    ...removeSentryAttributes(span.attributes),
  });

  const { traceId: trace_id, spanId: span_id } = span.spanContext();

  const parentSpanIdFromTraceState = span.spanContext().traceState?.get(SENTRY_TRACE_STATE_PARENT_SPAN_ID);

  // If parentSpanIdFromTraceState is defined at all, we want it to take precedence
  // In that case, an empty string should be interpreted as "no parent span id",
  // even if `span.parentSpanId` is set
  // this is the case when we are starting a new trace, where we have a virtual span based on the propagationContext
  // We only want to continue the traceId in this case, but ignore the parent span
  const parent_span_id =
    typeof parentSpanIdFromTraceState === 'string' ? parentSpanIdFromTraceState || undefined : span.parentSpanId;

  const status = mapStatus(span);

  const traceContext: TraceContext = dropUndefinedKeys({
    parent_span_id,
    span_id,
    trace_id,
    data: attributes,
    origin,
    op,
    status: getStatusMessage(status), // As per protocol, span status is allowed to be undefined
  });

  const transactionEvent: TransactionEvent = {
    contexts: {
      trace: traceContext,
      otel: {
        resource: span.resource.attributes,
      },
    },
    spans: [],
    start_timestamp: spanTimeInputToSeconds(span.startTime),
    timestamp: spanTimeInputToSeconds(span.endTime),
    transaction: description,
    type: 'transaction',
    sdkProcessingMetadata: {
      ...dropUndefinedKeys({
        capturedSpanScope: capturedSpanScopes.scope,
        capturedSpanIsolationScope: capturedSpanScopes.isolationScope,
        sampleRate,
        dynamicSamplingContext: getDynamicSamplingContextFromSpan(span as unknown as Span),
      }),
    },
    ...(source && {
      transaction_info: {
        source,
      },
    }),
    _metrics_summary: getMetricSummaryJsonForSpan(span as unknown as Span),
  };

  return transactionEvent;
}

function createAndFinishSpanForOtelSpan(node: SpanNode, spans: SpanJSON[], remaining: Set<SpanNode>): void {
  remaining.delete(node);
  const span = node.span;

  const shouldDrop = !span;

  // If this span should be dropped, we still want to create spans for the children of this
  if (shouldDrop) {
    node.children.forEach(child => {
      createAndFinishSpanForOtelSpan(child, spans, remaining);
    });
    return;
  }

  const span_id = span.spanContext().spanId;
  const trace_id = span.spanContext().traceId;

  const { attributes, startTime, endTime, parentSpanId } = span;

  const { op, description, data, origin = 'manual' } = getSpanData(span);
  const allData = dropUndefinedKeys({
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: origin,
    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: op,
    ...removeSentryAttributes(attributes),
    ...data,
  });

  const status = mapStatus(span);

  const spanJSON: SpanJSON = dropUndefinedKeys({
    span_id,
    trace_id,
    data: allData,
    description,
    parent_span_id: parentSpanId,
    start_timestamp: spanTimeInputToSeconds(startTime),
    // This is [0,0] by default in OTEL, in which case we want to interpret this as no end time
    timestamp: spanTimeInputToSeconds(endTime) || undefined,
    status: getStatusMessage(status), // As per protocol, span status is allowed to be undefined
    op,
    origin,
    _metrics_summary: getMetricSummaryJsonForSpan(span as unknown as Span),
    measurements: timedEventsToMeasurements(span.events),
  });

  spans.push(spanJSON);

  node.children.forEach(child => {
    createAndFinishSpanForOtelSpan(child, spans, remaining);
  });
}

function getSpanData(span: ReadableSpan): {
  data: Record<string, unknown>;
  op?: string;
  description: string;
  source?: TransactionSource;
  origin?: SpanOrigin;
} {
  const { op: definedOp, source: definedSource, origin } = parseSpan(span);
  const { op: inferredOp, description, source: inferredSource, data: inferredData } = parseSpanDescription(span);

  const op = definedOp || inferredOp;
  const source = definedSource || inferredSource;

  const data = { ...inferredData, ...getData(span) };

  return {
    op,
    description,
    source,
    origin,
    data,
  };
}

/**
 * Remove custom `sentry.` attributes we do not need to send.
 * These are more carrier attributes we use inside of the SDK, we do not need to send them to the API.
 */
function removeSentryAttributes(data: Record<string, unknown>): Record<string, unknown> {
  const cleanedData = { ...data };

  /* eslint-disable @typescript-eslint/no-dynamic-delete */
  delete cleanedData[SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE];
  delete cleanedData[SEMANTIC_ATTRIBUTE_SENTRY_PARENT_IS_REMOTE];
  /* eslint-enable @typescript-eslint/no-dynamic-delete */

  return cleanedData;
}

function getData(span: ReadableSpan): Record<string, unknown> {
  const attributes = span.attributes;
  const data: Record<string, unknown> = {};

  if (span.kind !== SpanKind.INTERNAL) {
    data['otel.kind'] = SpanKind[span.kind];
  }

  // eslint-disable-next-line deprecation/deprecation
  const maybeHttpStatusCodeAttribute = attributes[SEMATTRS_HTTP_STATUS_CODE];
  if (maybeHttpStatusCodeAttribute) {
    data[ATTR_HTTP_RESPONSE_STATUS_CODE] = maybeHttpStatusCodeAttribute as string;
  }

  const requestData = getRequestSpanData(span);

  if (requestData.url) {
    data.url = requestData.url;
  }

  if (requestData['http.query']) {
    data['http.query'] = requestData['http.query'].slice(1);
  }
  if (requestData['http.fragment']) {
    data['http.fragment'] = requestData['http.fragment'].slice(1);
  }

  return data;
}
