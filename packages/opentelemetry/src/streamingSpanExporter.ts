import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import type { Client, Span } from '@sentry/core';
import {
  captureSpan,
  safeSetSpanJSONAttributes,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  SpanBuffer,
} from '@sentry/core';
import { getSpanData, type ISentrySpanExporter } from './spanExporter';

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
  private _buffer: SpanBuffer;
  private _client: Client;

  public constructor(client: Client, options?: StreamingSpanExporterOptions) {
    this._client = client;
    this._buffer = new SpanBuffer(client, {
      maxSpanLimit: options?.maxSpanLimit,
      flushInterval: options?.flushInterval,
    });

    // OTel-specific: add span attributes from ReadableSpan
    this._client.on('processSpan', (spanJSON, hint) => {
      const { readOnlySpan } = hint;
      // TODO: This can be simplified by using spanJSON to get the data instead of the readOnlySpan
      // for now this is the easiest backwards-compatible way to get the data.
      const { op, description, data, origin = 'manual' } = getSpanData(readOnlySpan as unknown as ReadableSpan);
      const allData = {
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: origin,
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: op,
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'custom',
        ...data,
      };
      safeSetSpanJSONAttributes(spanJSON, allData);
      spanJSON.name = description;
    });

    this._client.on('enqueueSpan', spanJSON => {
      this._buffer.addSpan(spanJSON);
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
   */
  public flush(): void {
    this._buffer.flush();
  }

  /**
   * Clear the exporter.
   * This is called when the span processor is shut down.
   */
  public clear(): void {
    // No-op for streaming exporter - spans are flushed immediately on interval
  }
}
