import type { SpanAttributes, StreamedSpanJSON } from '@sentry/core';
import {
  safeSetSpanJSONAttributes,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  SPAN_KIND,
  spanKindToName,
} from '@sentry/core';
import { inferSpanData } from './parseSpanDescription';
import { SENTRY_ORIGIN } from '@sentry/conventions/attributes';

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
export function backfillStreamedSpanDataFromOtel(spanJSON: StreamedSpanJSON, hint?: { spanKind?: number }): void {
  const attributes = spanJSON.attributes ?? {};

  const kind = hint?.spanKind ?? SPAN_KIND.INTERNAL;
  const { op, description, source, data } = inferSpanData(spanJSON.name, attributes as unknown as SpanAttributes, kind);

  spanJSON.name = description;

  safeSetSpanJSONAttributes(spanJSON, {
    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: op,
    [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: source,
    // If nothing in the chain previously set an origin, we now default it to 'manual'
    // For transactions, this is done in the SpanExporter.
    // TODO (v11): Remove this again once we fully moved away from OTel's TracerProvider.
    // at this point, we use `SentrySpan` everywhere, which defaults its origin to 'manual'.
    [SENTRY_ORIGIN]: 'manual',
    ...data,
  });

  if (kind !== SPAN_KIND.INTERNAL) {
    safeSetSpanJSONAttributes(spanJSON, {
      'otel.kind': spanKindToName(kind),
    });
  }
}
