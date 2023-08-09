import type { Context, SpanOrigin } from '@sentry/types';

type SentryTags = Record<string, string>;
type SentryData = Record<string, unknown>;
type Contexts = Record<string, Context>;

export interface AdditionalOtelSpanData {
  data: SentryData;
  tags: SentryTags;
  contexts: Contexts;
  metadata: unknown;
  origin?: SpanOrigin;
}

const OTEL_SPAN_DATA_MAP: Map<string, AdditionalOtelSpanData> = new Map<string, AdditionalOtelSpanData>();

/** Add data that should be added to the sentry span resulting from the given otel span ID. */
export function addOtelSpanData(otelSpanId: string, data: Partial<AdditionalOtelSpanData>): void {
  OTEL_SPAN_DATA_MAP.set(otelSpanId, { data: {}, tags: {}, contexts: {}, metadata: {}, ...data });
}

/** Get additional data for a Sentry span. */
export function getOtelSpanData(otelSpanId: string): AdditionalOtelSpanData {
  if (OTEL_SPAN_DATA_MAP.has(otelSpanId)) {
    return OTEL_SPAN_DATA_MAP.get(otelSpanId) as AdditionalOtelSpanData;
  }

  return { data: {}, tags: {}, contexts: {}, metadata: {} };
}

/** Add data that should be added to the sentry span resulting from the given otel span ID. */
export function clearOtelSpanData(otelSpanId: string): void {
  OTEL_SPAN_DATA_MAP.delete(otelSpanId);
}
