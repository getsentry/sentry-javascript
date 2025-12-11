import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import type { Client, Span, SpanV2JSON } from '@sentry/core';
import {
  type SpanV2JSONWithSegmentRef,
  captureSpan,
  createSpanV2Envelope,
  debug,
  getDynamicSamplingContextFromSpan,
  safeSetSpanJSONAttributes,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
} from '@sentry/core';
import { DEBUG_BUILD } from './debug-build';
import { type ISentrySpanExporter, getSpanData } from './spanExporter';

type StreamingSpanExporterOptions = {
  flushInterval?: number;
  maxSpanLimit?: number;
};

/**
 * A Sentry-specific exporter that buffers span JSON objects and streams them to Sentry
 * in Span v2 envelopes. This exporter works with pre-serialized span JSON rather than
 * OTel span instances to avoid mutating already-ended spans.
 */
export class StreamingSpanExporter implements ISentrySpanExporter {
  private _flushInterval: number;
  private _maxSpanLimit: number;

  private _spanTreeMap: Map<string, Set<SpanV2JSONWithSegmentRef>>;

  private _flushIntervalId: NodeJS.Timeout | null;

  private _client: Client;

  public constructor(client: Client, options?: StreamingSpanExporterOptions) {
    this._spanTreeMap = new Map();
    this._client = client;

    const safeMaxSpanLimit =
      options?.maxSpanLimit && options.maxSpanLimit > 0 && options.maxSpanLimit <= 1000 ? options.maxSpanLimit : 1000;
    const safeFlushInterval = options?.flushInterval && options?.flushInterval > 0 ? options.flushInterval : 5_000;
    this._flushInterval = safeFlushInterval;
    this._maxSpanLimit = safeMaxSpanLimit;

    this._flushIntervalId = setInterval(() => {
      this.flush();
    }, this._flushInterval);

    this._client.on('processSpan', (spanJSON, hint) => {
      const { readOnlySpan } = hint;
      // TODO: This can be simplified by using spanJSON to get the data instead of the readOnlySpan
      // for now this is the easiest backwards-compatible way to get the data.
      const { op, description, data, origin = 'manual' } = getSpanData(readOnlySpan as unknown as ReadableSpan);
      const allData = {
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: origin,
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: op,
        ...data,
      };
      safeSetSpanJSONAttributes(spanJSON, allData);
      spanJSON.name = description;
    });

    this._client.on('enqueueSpan', spanJSON => {
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
    });
  }

  /**
   * Enqueue a span JSON into the buffer
   */
  public export(span: ReadableSpan & Span): void {
    captureSpan(span, this._client);
  }

  /**
   * Try to flush any pending spans immediately.
   * This is called internally by the exporter (via _debouncedFlush),
   * but can also be triggered externally if we force-flush.
   */
  public flush(): void {
    if (!this._spanTreeMap.size) {
      return;
    }

    debug.log(`Flushing span tree map with ${this._spanTreeMap.size} traces`);

    this._spanTreeMap.forEach((_, traceId) => {
      this._flushTrace(traceId);
    });
    this._debounceFlushInterval();
  }

  /**
   * Clear the exporter.
   * This is called when the span processor is shut down.
   */
  public clear(): void {
    if (this._flushIntervalId) {
      clearInterval(this._flushIntervalId);
      this._flushIntervalId = null;
    }
    // TODO (span-streaming): record client outcome for leftover spans?
    this._spanTreeMap.clear();
  }

  /**
   * Flush a trace from the span tree map.
   */
  private _flushTrace(traceId: string): void {
    const traceBucket = this._spanTreeMap.get(traceId);
    if (!traceBucket) {
      return;
    }

    if (!traceBucket.size) {
      this._spanTreeMap.delete(traceId);
      return;
    }

    // we checked against empty bucket above, so we can safely get the first span JSON here
    const firstSpanJSON = traceBucket.values().next().value;

    // Extract the segment span reference for DSC calculation
    const segmentSpan = firstSpanJSON?._segmentSpan;
    if (!segmentSpan) {
      DEBUG_BUILD && debug.warn('No segment span reference found on span JSON, cannot compute DSC');
      this._spanTreeMap.delete(traceId);
      return;
    }

    const dsc = getDynamicSamplingContextFromSpan(segmentSpan);

    // Clean up segment span references before sending
    const cleanedSpans: SpanV2JSON[] = Array.from(traceBucket).map(spanJSON => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { _segmentSpan, ...cleanSpanJSON } = spanJSON;
      return cleanSpanJSON;
    });

    const envelope = createSpanV2Envelope(cleanedSpans, dsc, this._client);

    debug.log(`Sending span envelope for trace ${traceId} with ${cleanedSpans.length} spans`);

    this._client.sendEnvelope(envelope).then(null, reason => {
      DEBUG_BUILD && debug.error('Error while sending span stream envelope:', reason);
    });

    this._spanTreeMap.delete(traceId);
  }

  /**
   * Debounce (reset) the flush interval.
   */
  private _debounceFlushInterval(): void {
    if (this._flushIntervalId) {
      clearInterval(this._flushIntervalId);
    }
    this._flushIntervalId = setInterval(() => {
      this.flush();
    }, this._flushInterval);
  }
}
