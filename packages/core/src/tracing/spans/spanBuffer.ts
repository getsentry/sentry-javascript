import type { Client } from '../../client';
import { DEBUG_BUILD } from '../../debug-build';
import type { SerializedStreamedSpan, Span } from '../../types/span';
import { debug } from '../../utils/debug-logger';
import { spanToJSON } from '../../utils/spanUtils';
import { safeUnref } from '../../utils/timer';
import { getDynamicSamplingContextFromSpan } from '../dynamicSamplingContext';
import type { SerializedStreamedSpanWithSegmentSpan } from './captureSpan';
import { createStreamedSpanEnvelope } from './envelope';
import { estimateSerializedSpanSizeInBytes } from './estimateSize';
import { SENTRY_SEGMENT_NAME } from '@sentry/conventions/attributes';

/**
 * We must not send more than 1000 spans in one envelope.
 * Otherwise the envelope is dropped by Relay.
 */
const MAX_SPANS_PER_ENVELOPE = 1000;

const MAX_TRACE_WEIGHT_IN_BYTES = 5_000_000;

interface TraceBucket {
  spans: Set<SerializedStreamedSpanWithSegmentSpan>;
  size: number;
  timeout: ReturnType<typeof setTimeout>;
}

export interface SpanBufferOptions {
  /**
   * Max spans per trace before auto-flush
   * Must not exceed 1000.
   *
   * @default 1_000
   */
  maxSpanLimit?: number;

  /**
   * Per-trace flush timeout in ms. A timeout is started when a trace bucket is first created
   * and fires flush() for that specific trace when it expires.
   * Must be greater than 0.
   *
   * @default 5_000
   */
  flushInterval?: number;

  /**
   * Max accumulated byte weight of spans per trace before auto-flush.
   * Size is estimated, not exact. Uses 2 bytes per character for strings (UTF-16).
   *
   * @default 5_000_000 (5 MB)
   */
  maxTraceWeightInBytes?: number;
}

/**
 * A buffer for serialized streamed span JSON objects that flushes them to Sentry in Span v2 envelopes.
 * Handles per-trace timeout-based flushing, size thresholds, and graceful shutdown.
 * Also handles computation of the Dynamic Sampling Context (DSC) for the trace, if it wasn't yet
 * frozen onto the segment span.
 *
 * For this, we need the reference to the segment span instance, from
 * which we compute the DSC. Doing this in the buffer ensures that we compute the DSC as late as possible,
 * allowing span name and data updates up to this point. Worth noting here that the segment span is likely
 * still active and modifyable when child spans are added to the buffer.
 */
export class SpanBuffer {
  /* Bucket spans by their trace id, along with accumulated size and a per-trace flush timeout */
  private _traceBuckets: Map<string, TraceBucket>;

  private _client: Client;
  private _maxSpanLimit: number;
  private _flushInterval: number;
  private _maxTraceWeight: number;

  public constructor(client: Client, options?: SpanBufferOptions) {
    this._traceBuckets = new Map();
    this._client = client;

    const { maxSpanLimit, flushInterval, maxTraceWeightInBytes } = options ?? {};

    this._maxSpanLimit =
      maxSpanLimit && maxSpanLimit > 0 && maxSpanLimit <= MAX_SPANS_PER_ENVELOPE
        ? maxSpanLimit
        : MAX_SPANS_PER_ENVELOPE;
    this._flushInterval = flushInterval && flushInterval > 0 ? flushInterval : 5_000;
    this._maxTraceWeight =
      maxTraceWeightInBytes && maxTraceWeightInBytes > 0 ? maxTraceWeightInBytes : MAX_TRACE_WEIGHT_IN_BYTES;

    this._client.on('flush', () => {
      this.drain();
    });

    this._client.on('close', () => {
      // No need to drain the buffer here as `Client.close()` internally already calls `Client.flush()`
      // which already invokes the `flush` hook and thus drains the buffer.
      this._traceBuckets.forEach(bucket => {
        clearTimeout(bucket.timeout);
      });
      this._traceBuckets.clear();
    });
  }

  /**
   * Add a span to the buffer.
   */
  public add(spanJSON: SerializedStreamedSpanWithSegmentSpan): void {
    const traceId = spanJSON.trace_id;
    let bucket = this._traceBuckets.get(traceId);

    if (!bucket) {
      bucket = {
        spans: new Set(),
        size: 0,
        timeout: safeUnref(
          setTimeout(() => {
            this.flush(traceId);
          }, this._flushInterval),
        ),
      };
      this._traceBuckets.set(traceId, bucket);
    }

    bucket.spans.add(spanJSON);
    bucket.size += estimateSerializedSpanSizeInBytes(spanJSON);

    if (bucket.spans.size >= this._maxSpanLimit || bucket.size >= this._maxTraceWeight) {
      this.flush(traceId);
    }
  }

  /**
   * Drain and flush all buffered traces.
   */
  public drain(): void {
    if (!this._traceBuckets.size) {
      return;
    }

    DEBUG_BUILD && debug.log(`Flushing span tree map with ${this._traceBuckets.size} traces`);

    this._traceBuckets.forEach((_, traceId) => {
      this.flush(traceId);
    });
  }

  /**
   * Flush spans of a specific trace.
   * In contrast to {@link SpanBuffer.drain}, this method does not flush all traces, but only the one with the given traceId.
   */
  public flush(traceId: string): void {
    const bucket = this._traceBuckets.get(traceId);
    if (!bucket) {
      return;
    }

    if (!bucket.spans.size) {
      // we should never get here, given we always add a span when we create a new bucket
      // and delete the bucket once we flush out the trace
      this._removeTrace(traceId);
      return;
    }

    const spans = Array.from(bucket.spans);

    const segmentSpan = spans[0]?._segmentSpan;
    if (!segmentSpan) {
      DEBUG_BUILD && debug.warn('No segment span reference found on span JSON, cannot compute DSC');
      this._removeTrace(traceId);
      return;
    }

    const dsc = getDynamicSamplingContextFromSpan(segmentSpan);

    const currentSegmentNames = new Map<Span, string>();
    const getCurrentSegmentName = (span: Span): string => {
      let name = currentSegmentNames.get(span);
      if (name === undefined) {
        name = spanToJSON(span).name;
        currentSegmentNames.set(span, name);
      }
      return name;
    };

    const cleanedSpans: SerializedStreamedSpan[] = spans.map(spanJSON => {
      const { _segmentSpan, _segmentNameAtCapture, ...cleanSpanJSON } = spanJSON;
      refreshSegmentName(cleanSpanJSON, _segmentNameAtCapture, () => getCurrentSegmentName(_segmentSpan));
      return cleanSpanJSON;
    });

    const envelope = createStreamedSpanEnvelope(cleanedSpans, dsc, this._client);

    DEBUG_BUILD && debug.log(`Sending span envelope for trace ${traceId} with ${cleanedSpans.length} spans`);

    this._client.sendEnvelope(envelope).then(null, reason => {
      DEBUG_BUILD && debug.error('Error while sending streamed span envelope:', reason);
    });

    this._removeTrace(traceId);
  }

  private _removeTrace(traceId: string): void {
    const bucket = this._traceBuckets.get(traceId);
    if (bucket) {
      clearTimeout(bucket.timeout);
    }
    this._traceBuckets.delete(traceId);
  }
}

/**
 * Spans are captured when they end, but the segment span can still be renamed afterwards
 * (e.g. once the route is known). Only replace the value we set at capture time, so that
 * values set by users or `beforeSendSpan` are kept.
 */
function refreshSegmentName(
  spanJSON: SerializedStreamedSpan,
  segmentNameAtCapture: string | undefined,
  getCurrentSegmentName: () => string,
): void {
  const segmentNameAttribute = spanJSON.attributes[SENTRY_SEGMENT_NAME];
  if (segmentNameAtCapture === undefined || segmentNameAttribute?.value !== segmentNameAtCapture) {
    return;
  }

  const currentSegmentName = getCurrentSegmentName();
  if (currentSegmentName !== segmentNameAtCapture) {
    spanJSON.attributes[SENTRY_SEGMENT_NAME] = { ...segmentNameAttribute, value: currentSegmentName };
  }
}
