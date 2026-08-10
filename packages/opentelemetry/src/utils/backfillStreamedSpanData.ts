import type { SpanAttributes, StreamedSpanJSON } from '@sentry/core';
import { safeSetSpanJSONAttributes, SEMANTIC_ATTRIBUTE_SENTRY_OP } from '@sentry/core';
import { inferSpanData } from './parseSpanDescription';

/**
 * Backfill op, source, name and data on a streamed span JSON from OTel semantic conventions.
 * Mirrors the inference the {@link SentrySpanExporter} applies to non-streamed spans via `getSpanData`.
 * Explicitly set attributes are preserved via `safeSetSpanJSONAttributes`.
 *
 * Runs as a `preprocessSpan` subscriber (streamed-only) on both span pipelines: the OTel SDK
 * `SentrySpanProcessor` and the `SentryTracerProvider`. On the latter, `applyOtelSpanData` has already
 * inferred most data on the native span; this fills the remaining gap (per-span `sentry.source` on
 * child spans, which `applyOtelSpanData` only sets on segment roots). `inferSpanData` is deterministic
 * on the same attributes, so re-running it here is a no-op for already-inferred fields.
 */
export function backfillStreamedSpanDataFromOtel(spanJSON: StreamedSpanJSON): void {
  const attributes = spanJSON.attributes ?? {};

  const { op } = inferSpanData(attributes as unknown as SpanAttributes);

  safeSetSpanJSONAttributes(spanJSON, {
    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: op,
  });
}
