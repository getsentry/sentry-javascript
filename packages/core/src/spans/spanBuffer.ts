import type { Client } from '../client';
import { DEBUG_BUILD } from '../debug-build';
import { createSpanV2Envelope } from '../envelope';
import { getDynamicSamplingContextFromSpan } from '../tracing/dynamicSamplingContext';
import type { SpanV2JSON, SpanV2JSONWithSegmentRef } from '../types-hoist/span';
import { debug } from '../utils/debug-logger';

export interface SpanBufferOptions {
  /** Max spans per trace before auto-flush (default: 1000) */
  maxSpanLimit?: number;
  /** Flush interval in ms (default: 5000) */
  flushInterval?: number;
}

/**
 * A buffer for span JSON objects that flushes them to Sentry in Span v2 envelopes.
 * Handles interval-based flushing, size thresholds, and graceful shutdown.
 */
export class SpanBuffer {
  private _spanTreeMap: Map<string, Set<SpanV2JSONWithSegmentRef>>;
  private _flushIntervalId: ReturnType<typeof setInterval> | null;
  private _client: Client;
  private _maxSpanLimit: number;
  private _flushInterval: number;

  public constructor(client: Client, options?: SpanBufferOptions) {
    this._spanTreeMap = new Map();
    this._client = client;

    const { maxSpanLimit, flushInterval } = options ?? {};

    this._maxSpanLimit = maxSpanLimit && maxSpanLimit > 0 && maxSpanLimit <= 1000 ? maxSpanLimit : 1000;
    this._flushInterval = flushInterval && flushInterval > 0 ? flushInterval : 5_000;

    this._flushIntervalId = setInterval(() => {
      this.flush();
    }, this._flushInterval);

    this._client.on('flush', () => {
      this.flush();
    });
  }

  /**
   * Add a span to the buffer.
   */
  public addSpan(spanJSON: SpanV2JSONWithSegmentRef): void {
    const traceId = spanJSON.trace_id;
    let traceBucket = this._spanTreeMap.get(traceId);
    if (traceBucket) {
      traceBucket.add(spanJSON);
    } else {
      traceBucket = new Set([spanJSON]);
      this._spanTreeMap.set(traceId, traceBucket);
    }

    if (traceBucket.size >= this._maxSpanLimit) {
      this._flushTrace(traceId);
      this._debounceFlushInterval();
    }
  }

  /**
   * Flush all buffered traces.
   */
  public flush(): void {
    if (!this._spanTreeMap.size) {
      return;
    }

    DEBUG_BUILD && debug.log(`Flushing span tree map with ${this._spanTreeMap.size} traces`);

    this._spanTreeMap.forEach((_, traceId) => {
      this._flushTrace(traceId);
    });
    this._debounceFlushInterval();
  }

  private _flushTrace(traceId: string): void {
    const traceBucket = this._spanTreeMap.get(traceId);
    if (!traceBucket) {
      return;
    }

    if (!traceBucket.size) {
      this._spanTreeMap.delete(traceId);
      return;
    }

    const firstSpanJSON = traceBucket.values().next().value;

    const segmentSpan = firstSpanJSON?._segmentSpan;
    if (!segmentSpan) {
      DEBUG_BUILD && debug.warn('No segment span reference found on span JSON, cannot compute DSC');
      this._spanTreeMap.delete(traceId);
      return;
    }

    const dsc = getDynamicSamplingContextFromSpan(segmentSpan);

    const cleanedSpans: SpanV2JSON[] = Array.from(traceBucket).map(spanJSON => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { _segmentSpan, ...cleanSpanJSON } = spanJSON;
      return cleanSpanJSON;
    });

    const envelope = createSpanV2Envelope(cleanedSpans, dsc, this._client);

    DEBUG_BUILD && debug.log(`Sending span envelope for trace ${traceId} with ${cleanedSpans.length} spans`);

    this._client.sendEnvelope(envelope).then(null, reason => {
      DEBUG_BUILD && debug.error('Error while sending span stream envelope:', reason);
    });

    this._spanTreeMap.delete(traceId);
  }

  private _debounceFlushInterval(): void {
    if (this._flushIntervalId) {
      clearInterval(this._flushIntervalId);
    }
    this._flushIntervalId = setInterval(() => {
      this.flush();
    }, this._flushInterval);
  }
}
