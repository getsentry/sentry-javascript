import type { Client } from '../../client';
import { DEBUG_BUILD } from '../../debug-build';
import type { SerializedStreamedSpan } from '../../types-hoist/span';
import { debug } from '../../utils/debug-logger';
import { safeUnref } from '../../utils/timer';
import { getDynamicSamplingContextFromSpan } from '../dynamicSamplingContext';
import type { SerializedStreamedSpanWithSegmentSpan } from './captureSpan';
import { createStreamedSpanEnvelope } from './envelope';

/**
 * We must not send more than 1000 spans in one envelope.
 * Otherwise the envelope is dropped by Relay.
 */
const MAX_SPANS_PER_ENVELOPE = 1000;

export interface SpanBufferOptions {
  /**
   * Max spans per trace before auto-flush
   * Must not exceed 1000.
   *
   * @default 1_000
   */
  maxSpanLimit?: number;

  /**
   * Flush interval in ms
   * Must be greater than 0.
   *
   * @default 5_000
   */
  flushInterval?: number;
}

/**
 * A buffer for serialized streamed span JSON objects that flushes them to Sentry in Span v2 envelopes.
 * Handles interval-based flushing, size thresholds, and graceful shutdown.
 * Also handles computation of the Dynamic Sampling Context (DSC) for the trace, if it wasn't yet
 * frozen onto the segment span.
 *
 * For this, we need the reference to the segment span instance, from
 * which we compute the DSC. Doing this in the buffer ensures that we compute the DSC as late as possible,
 * allowing span name and data updates up to this point. Worth noting here that the segment span is likely
 * still active and modifyable when child spans are added to the buffer.
 */
export class SpanBuffer {
  /* Bucket spans by their trace id */
  private _traceMap: Map<string, Set<SerializedStreamedSpanWithSegmentSpan>>;

  private _flushIntervalId: ReturnType<typeof setInterval> | null;
  private _client: Client;
  private _maxSpanLimit: number;
  private _flushInterval: number;

  public constructor(client: Client, options?: SpanBufferOptions) {
    this._traceMap = new Map();
    this._client = client;

    const { maxSpanLimit, flushInterval } = options ?? {};

    this._maxSpanLimit =
      maxSpanLimit && maxSpanLimit > 0 && maxSpanLimit <= MAX_SPANS_PER_ENVELOPE
        ? maxSpanLimit
        : MAX_SPANS_PER_ENVELOPE;
    this._flushInterval = flushInterval && flushInterval > 0 ? flushInterval : 5_000;

    this._flushIntervalId = null;
    this._debounceFlushInterval();

    this._client.on('flush', () => {
      this.drain();
    });

    this._client.on('close', () => {
      // No need to drain the buffer here as `Client.close()` internally already calls `Client.flush()`
      // which already invokes the `flush` hook and thus drains the buffer.
      if (this._flushIntervalId) {
        clearInterval(this._flushIntervalId);
      }
      this._traceMap.clear();
    });
  }

  /**
   * Add a span to the buffer.
   */
  public add(spanJSON: SerializedStreamedSpanWithSegmentSpan): void {
    const traceId = spanJSON.trace_id;
    let traceBucket = this._traceMap.get(traceId);
    if (traceBucket) {
      traceBucket.add(spanJSON);
    } else {
      traceBucket = new Set([spanJSON]);
      this._traceMap.set(traceId, traceBucket);
    }

    if (traceBucket.size >= this._maxSpanLimit) {
      this.flush(traceId);
      this._debounceFlushInterval();
    }
  }

  /**
   * Drain and flush all buffered traces.
   */
  public drain(): void {
    if (!this._traceMap.size) {
      return;
    }

    DEBUG_BUILD && debug.log(`Flushing span tree map with ${this._traceMap.size} traces`);

    this._traceMap.forEach((_, traceId) => {
      this.flush(traceId);
    });
    this._debounceFlushInterval();
  }

  /**
   * Flush spans of a specific trace.
   * In contrast to {@link SpanBuffer.flush}, this method does not flush all traces, but only the one with the given traceId.
   */
  public flush(traceId: string): void {
    const traceBucket = this._traceMap.get(traceId);
    if (!traceBucket) {
      return;
    }

    if (!traceBucket.size) {
      // we should never get here, given we always add a span  when we create a new bucket
      // and delete the bucket once we flush out the trace
      this._traceMap.delete(traceId);
      return;
    }

    const spans = Array.from(traceBucket);

    const segmentSpan = spans[0]?._segmentSpan;
    if (!segmentSpan) {
      DEBUG_BUILD && debug.warn('No segment span reference found on span JSON, cannot compute DSC');
      this._traceMap.delete(traceId);
      return;
    }

    const dsc = getDynamicSamplingContextFromSpan(segmentSpan);

    const cleanedSpans: SerializedStreamedSpan[] = spans.map(spanJSON => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { _segmentSpan, ...cleanSpanJSON } = spanJSON;
      return cleanSpanJSON;
    });

    const envelope = createStreamedSpanEnvelope(cleanedSpans, dsc, this._client);

    DEBUG_BUILD && debug.log(`Sending span envelope for trace ${traceId} with ${cleanedSpans.length} spans`);

    this._client.sendEnvelope(envelope).then(null, reason => {
      DEBUG_BUILD && debug.error('Error while sending streamed span envelope:', reason);
    });

    this._traceMap.delete(traceId);
  }

  private _debounceFlushInterval(): void {
    if (this._flushIntervalId) {
      clearInterval(this._flushIntervalId);
    }
    this._flushIntervalId = safeUnref(
      setInterval(() => {
        this.drain();
      }, this._flushInterval),
    );
  }
}
