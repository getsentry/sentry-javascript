/* eslint-disable max-lines */
import type { Span } from '@opentelemetry/api';
import { SpanKind } from '@opentelemetry/api';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { ATTR_HTTP_RESPONSE_STATUS_CODE, SEMATTRS_HTTP_STATUS_CODE } from '@opentelemetry/semantic-conventions';
import type {
  SpanAttributes,
  SpanJSON,
  SpanOrigin,
  TraceContext,
  TransactionEvent,
  TransactionSource,
} from '@sentry/core';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_CUSTOM_SPAN_NAME,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  captureEvent,
  dropUndefinedKeys,
  getCapturedScopesOnSpan,
  getDynamicSamplingContextFromSpan,
  getStatusMessage,
  logger,
  spanTimeInputToSeconds,
  timedEventsToMeasurements,
} from '@sentry/core';
import { DEBUG_BUILD } from './debug-build';
import { SEMANTIC_ATTRIBUTE_SENTRY_PARENT_IS_REMOTE } from './semanticAttributes';
import { getRequestSpanData } from './utils/getRequestSpanData';
import type { SpanNode } from './utils/groupSpansWithParents';
import { getLocalParentId, groupSpansWithParents } from './utils/groupSpansWithParents';
import { mapStatus } from './utils/mapStatus';
import { parseSpanDescription } from './utils/parseSpanDescription';

type SpanNodeCompleted = SpanNode & { span: ReadableSpan };

const MAX_SPAN_COUNT = 1000;
const DEFAULT_TIMEOUT = 300; // 5 min

interface FinishedSpanBucket {
  timestampInS: number;
  spans: Set<ReadableSpan>;
}

/**
 * A Sentry-specific exporter that converts OpenTelemetry Spans to Sentry Spans & Transactions.
 */
export class SentrySpanExporter {
  private _flushTimeout: ReturnType<typeof setTimeout> | undefined;

  /*
   * A quick explanation on the buckets: We do bucketing of finished spans for efficiency. This span exporter is
   * accumulating spans until a root span is encountered and then it flushes all the spans that are descendants of that
   * root span. Because it is totally in the realm of possibilities that root spans are never finished, and we don't
   * want to accumulate spans indefinitely in memory, we need to periodically evacuate spans. Naively we could simply
   * store the spans in an array and each time a new span comes in we could iterate through the entire array and
   * evacuate all spans that have an end-timestamp that is older than our limit. This could get quite expensive because
   * we would have to iterate a potentially large number of spans every time we evacuate. We want to avoid these large
   * bursts of computation.
   *
   * Instead we go for a bucketing approach and put spans into buckets, based on what second
   * (modulo the time limit) the span was put into the exporter. With buckets, when we decide to evacuate, we can
   * iterate through the bucket entries instead, which have an upper bound of items, making the evacuation much more
   * efficient. Cleaning up also becomes much more efficient since it simply involves de-referencing a bucket within the
   * bucket array, and letting garbage collection take care of the rest.
   */
  private _finishedSpanBuckets: (FinishedSpanBucket | undefined)[];
  private _finishedSpanBucketSize: number;
  private _spansToBucketEntry: WeakMap<ReadableSpan, FinishedSpanBucket>;
  private _lastCleanupTimestampInS: number;

  public constructor(options?: {
    /** Lower bound of time in seconds until spans that are buffered but have not been sent as part of a transaction get cleared from memory. */
    timeout?: number;
  }) {
    this._finishedSpanBucketSize = options?.timeout || DEFAULT_TIMEOUT;
    this._finishedSpanBuckets = new Array(this._finishedSpanBucketSize).fill(undefined);
    this._lastCleanupTimestampInS = Math.floor(Date.now() / 1000);
    this._spansToBucketEntry = new WeakMap();
  }

  /** Export a single span. */
  public export(span: ReadableSpan): void {
    const currentTimestampInS = Math.floor(Date.now() / 1000);

    if (this._lastCleanupTimestampInS !== currentTimestampInS) {
      let droppedSpanCount = 0;
      this._finishedSpanBuckets.forEach((bucket, i) => {
        if (bucket && bucket.timestampInS <= currentTimestampInS - this._finishedSpanBucketSize) {
          droppedSpanCount += bucket.spans.size;
          this._finishedSpanBuckets[i] = undefined;
        }
      });
      if (droppedSpanCount > 0) {
        DEBUG_BUILD &&
          logger.log(
            `SpanExporter dropped ${droppedSpanCount} spans because they were pending for more than ${this._finishedSpanBucketSize} seconds.`,
          );
      }
      this._lastCleanupTimestampInS = currentTimestampInS;
    }

    const currentBucketIndex = currentTimestampInS % this._finishedSpanBucketSize;
    const currentBucket = this._finishedSpanBuckets[currentBucketIndex] || {
      timestampInS: currentTimestampInS,
      spans: new Set(),
    };
    this._finishedSpanBuckets[currentBucketIndex] = currentBucket;
    currentBucket.spans.add(span);
    this._spansToBucketEntry.set(span, currentBucket);

    // If the span doesn't have a local parent ID (it's a root span), we're gonna flush all the ended spans
    if (!getLocalParentId(span)) {
      this._clearTimeout();

      // If we got a parent span, we try to send the span tree
      // Wait a tick for this, to ensure we avoid race conditions
      this._flushTimeout = setTimeout(() => {
        this.flush();
      }, 1);
    }
  }

  /** Try to flush any pending spans immediately. */
  public flush(): void {
    this._clearTimeout();

    const finishedSpans: ReadableSpan[] = [];
    this._finishedSpanBuckets.forEach(bucket => {
      if (bucket) {
        finishedSpans.push(...bucket.spans);
      }
    });

    const sentSpans = maybeSend(finishedSpans);

    const sentSpanCount = sentSpans.size;

    const remainingOpenSpanCount = finishedSpans.length - sentSpanCount;

    DEBUG_BUILD &&
      logger.log(
        `SpanExporter exported ${sentSpanCount} spans, ${remainingOpenSpanCount} spans are waiting for their parent spans to finish`,
      );

    sentSpans.forEach(span => {
      const bucketEntry = this._spansToBucketEntry.get(span);
      if (bucketEntry) {
        bucketEntry.spans.delete(span);
      }
    });
  }

  /** Clear the exporter. */
  public clear(): void {
    this._finishedSpanBuckets = this._finishedSpanBuckets.fill(undefined);
    this._clearTimeout();
  }

  /** Clear the flush timeout. */
  private _clearTimeout(): void {
    if (this._flushTimeout) {
      clearTimeout(this._flushTimeout);
      this._flushTimeout = undefined;
    }
  }
}

/**
 * Send the given spans, but only if they are part of a finished transaction.
 *
 * Returns the sent spans.
 * Spans remain unsent when their parent span is not yet finished.
 * This will happen regularly, as child spans are generally finished before their parents.
 * But it _could_ also happen because, for whatever reason, a parent span was lost.
 * In this case, we'll eventually need to clean this up.
 */
function maybeSend(spans: ReadableSpan[]): Set<ReadableSpan> {
  const grouped = groupSpansWithParents(spans);
  const sentSpans = new Set<ReadableSpan>();

  const rootNodes = getCompletedRootNodes(grouped);

  rootNodes.forEach(root => {
    const span = root.span;
    sentSpans.add(span);
    const transactionEvent = createTransactionForOtelSpan(span);

    // We'll recursively add all the child spans to this array
    const spans = transactionEvent.spans || [];

    root.children.forEach(child => {
      createAndFinishSpanForOtelSpan(child, spans, sentSpans);
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

  return sentSpans;
}

function nodeIsCompletedRootNode(node: SpanNode): node is SpanNodeCompleted {
  return !!node.span && !node.parentNode;
}

function getCompletedRootNodes(nodes: SpanNode[]): SpanNodeCompleted[] {
  return nodes.filter(nodeIsCompletedRootNode);
}

function parseSpan(span: ReadableSpan): { op?: string; origin?: SpanOrigin; source?: TransactionSource } {
  const attributes = span.attributes;

  const origin = attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN] as SpanOrigin | undefined;
  const op = attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP] as string | undefined;
  const source = attributes[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE] as TransactionSource | undefined;

  return { origin, op, source };
}

/** Exported only for tests. */
export function createTransactionForOtelSpan(span: ReadableSpan): TransactionEvent {
  const { op, description, data, origin = 'manual', source } = getSpanData(span);
  const capturedSpanScopes = getCapturedScopesOnSpan(span as unknown as Span);

  const sampleRate = span.attributes[SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE] as number | undefined;

  const attributes: SpanAttributes = dropUndefinedKeys({
    [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: source,
    [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: sampleRate,
    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: op,
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: origin,
    ...data,
    ...removeSentryAttributes(span.attributes),
  });

  const { traceId: trace_id, spanId: span_id } = span.spanContext();

  // If parentSpanIdFromTraceState is defined at all, we want it to take precedence
  // In that case, an empty string should be interpreted as "no parent span id",
  // even if `span.parentSpanId` is set
  // this is the case when we are starting a new trace, where we have a virtual span based on the propagationContext
  // We only want to continue the traceId in this case, but ignore the parent span
  const parent_span_id = span.parentSpanId;

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

  const statusCode = attributes[ATTR_HTTP_RESPONSE_STATUS_CODE];
  const responseContext = typeof statusCode === 'number' ? { response: { status_code: statusCode } } : undefined;

  const transactionEvent: TransactionEvent = dropUndefinedKeys({
    contexts: {
      trace: traceContext,
      otel: {
        resource: span.resource.attributes,
      },
      ...responseContext,
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
  });

  return transactionEvent;
}

function createAndFinishSpanForOtelSpan(node: SpanNode, spans: SpanJSON[], sentSpans: Set<ReadableSpan>): void {
  const span = node.span;

  if (span) {
    sentSpans.add(span);
  }

  const shouldDrop = !span;

  // If this span should be dropped, we still want to create spans for the children of this
  if (shouldDrop) {
    node.children.forEach(child => {
      createAndFinishSpanForOtelSpan(child, spans, sentSpans);
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
    measurements: timedEventsToMeasurements(span.events),
  });

  spans.push(spanJSON);

  node.children.forEach(child => {
    createAndFinishSpanForOtelSpan(child, spans, sentSpans);
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
  delete cleanedData[SEMANTIC_ATTRIBUTE_SENTRY_CUSTOM_SPAN_NAME];
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
