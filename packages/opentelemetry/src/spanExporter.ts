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
  _INTERNAL_safeDateNow,
  captureEvent,
  convertSpanLinksForEnvelope,
  debounce,
  debug,
  getCapturedScopesOnSpan,
  getDynamicSamplingContextFromSpan,
  getStatusMessage,
  SEMANTIC_ATTRIBUTE_SENTRY_CUSTOM_SPAN_NAME,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  spanTimeInputToSeconds,
  timedEventsToMeasurements,
} from '@sentry/core';
import { DEBUG_BUILD } from './debug-build';
import { SEMANTIC_ATTRIBUTE_SENTRY_PARENT_IS_REMOTE } from './semanticAttributes';
import { getParentSpanId } from './utils/getParentSpanId';
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
  // Essentially a a set of span ids that are already sent. The values are expiration
  // times in this cache so we don't hold onto them indefinitely.
  private _sentSpans: Map<string, number>;
  /* Internally, we use a debounced flush to give some wiggle room to the span processor to accumulate more spans. */
  private _debouncedFlush: ReturnType<typeof debounce>;

  public constructor(options?: {
    /** Lower bound of time in seconds until spans that are buffered but have not been sent as part of a transaction get cleared from memory. */
    timeout?: number;
  }) {
    this._finishedSpanBucketSize = options?.timeout || DEFAULT_TIMEOUT;
    this._finishedSpanBuckets = new Array(this._finishedSpanBucketSize).fill(undefined);
    this._lastCleanupTimestampInS = Math.floor(_INTERNAL_safeDateNow() / 1000);
    this._spansToBucketEntry = new WeakMap();
    this._sentSpans = new Map<string, number>();
    this._debouncedFlush = debounce(this.flush.bind(this), 1, { maxWait: 100 });
  }

  /**
   * Export a single span.
   * This is called by the span processor whenever a span is ended.
   */
  public export(span: ReadableSpan): void {
    const currentTimestampInS = Math.floor(_INTERNAL_safeDateNow() / 1000);

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
          debug.log(
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
    const localParentId = getLocalParentId(span);
    if (!localParentId || this._sentSpans.has(localParentId)) {
      this._debouncedFlush();
    }
  }

  /**
   * Try to flush any pending spans immediately.
   * This is called internally by the exporter (via _debouncedFlush),
   * but can also be triggered externally if we force-flush.
   */
  public flush(): void {
    const finishedSpans = this._finishedSpanBuckets.flatMap(bucket => (bucket ? Array.from(bucket.spans) : []));

    this._flushSentSpanCache();
    const sentSpans = this._maybeSend(finishedSpans);

    const sentSpanCount = sentSpans.size;
    const remainingOpenSpanCount = finishedSpans.length - sentSpanCount;
    DEBUG_BUILD &&
      debug.log(
        `SpanExporter exported ${sentSpanCount} spans, ${remainingOpenSpanCount} spans are waiting for their parent spans to finish`,
      );

    const expirationDate = _INTERNAL_safeDateNow() + DEFAULT_TIMEOUT * 1000;

    for (const span of sentSpans) {
      this._sentSpans.set(span.spanContext().spanId, expirationDate);
      const bucketEntry = this._spansToBucketEntry.get(span);
      if (bucketEntry) {
        bucketEntry.spans.delete(span);
      }
    }
    // Cancel a pending debounced flush, if there is one
    // This can be relevant if we directly flush, circumventing the debounce
    // in that case, we want to cancel any pending debounced flush
    this._debouncedFlush.cancel();
  }

  /**
   * Clear the exporter.
   * This is called when the span processor is shut down.
   */
  public clear(): void {
    this._finishedSpanBuckets = this._finishedSpanBuckets.fill(undefined);
    this._sentSpans.clear();
    this._debouncedFlush.cancel();
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
  private _maybeSend(spans: ReadableSpan[]): Set<ReadableSpan> {
    const grouped = groupSpansWithParents(spans);
    const sentSpans = new Set<ReadableSpan>();

    const rootNodes = this._getCompletedRootNodes(grouped);

    for (const root of rootNodes) {
      const span = root.span;
      sentSpans.add(span);
      const transactionEvent = createTransactionForOtelSpan(span);

      // Add an attribute to the transaction event to indicate that this transaction is an orphaned transaction
      if (root.parentNode && this._sentSpans.has(root.parentNode.id)) {
        const traceData = transactionEvent.contexts?.trace?.data;
        if (traceData) {
          traceData['sentry.parent_span_already_sent'] = true;
        }
      }

      // We'll recursively add all the child spans to this array
      const spans = transactionEvent.spans || [];

      for (const child of root.children) {
        createAndFinishSpanForOtelSpan(child, spans, sentSpans);
      }

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
    }

    return sentSpans;
  }

  /** Remove "expired" span id entries from the _sentSpans cache. */
  private _flushSentSpanCache(): void {
    const currentTimestamp = _INTERNAL_safeDateNow();
    // Note, it is safe to delete items from the map as we go: https://stackoverflow.com/a/35943995/90297
    for (const [spanId, expirationTime] of this._sentSpans.entries()) {
      if (expirationTime <= currentTimestamp) {
        this._sentSpans.delete(spanId);
      }
    }
  }

  /** Check if a node is a completed root node or a node whose parent has already been sent */
  private _nodeIsCompletedRootNodeOrHasSentParent(node: SpanNode): node is SpanNodeCompleted {
    return !!node.span && (!node.parentNode || this._sentSpans.has(node.parentNode.id));
  }

  /** Get all completed root nodes from a list of nodes */
  private _getCompletedRootNodes(nodes: SpanNode[]): SpanNodeCompleted[] {
    // TODO: We should be able to remove the explicit `node is SpanNodeCompleted` type guard
    //       once we stop supporting TS < 5.5
    return nodes.filter((node): node is SpanNodeCompleted => this._nodeIsCompletedRootNodeOrHasSentParent(node));
  }
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

  const attributes: SpanAttributes = {
    [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: source,
    [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: sampleRate,
    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: op,
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: origin,
    ...data,
    ...removeSentryAttributes(span.attributes),
  };

  const { links } = span;
  const { traceId: trace_id, spanId: span_id } = span.spanContext();

  // If parentSpanIdFromTraceState is defined at all, we want it to take precedence
  // In that case, an empty string should be interpreted as "no parent span id",
  // even if `span.parentSpanId` is set
  // this is the case when we are starting a new trace, where we have a virtual span based on the propagationContext
  // We only want to continue the traceId in this case, but ignore the parent span
  const parent_span_id = getParentSpanId(span);

  const status = mapStatus(span);

  const traceContext: TraceContext = {
    parent_span_id,
    span_id,
    trace_id,
    data: attributes,
    origin,
    op,
    status: getStatusMessage(status), // As per protocol, span status is allowed to be undefined
    links: convertSpanLinksForEnvelope(links),
  };

  const statusCode = attributes[ATTR_HTTP_RESPONSE_STATUS_CODE];
  const responseContext = typeof statusCode === 'number' ? { response: { status_code: statusCode } } : undefined;

  const transactionEvent: TransactionEvent = {
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
      capturedSpanScope: capturedSpanScopes.scope,
      capturedSpanIsolationScope: capturedSpanScopes.isolationScope,
      sampleRate,
      dynamicSamplingContext: getDynamicSamplingContextFromSpan(span as unknown as Span),
    },
    ...(source && {
      transaction_info: {
        source,
      },
    }),
  };

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
  const parentSpanId = getParentSpanId(span);

  const { attributes, startTime, endTime, links } = span;

  const { op, description, data, origin = 'manual' } = getSpanData(span);
  const allData = {
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: origin,
    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: op,
    ...removeSentryAttributes(attributes),
    ...data,
  };

  const status = mapStatus(span);

  const spanJSON: SpanJSON = {
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
    links: convertSpanLinksForEnvelope(links),
  };

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
