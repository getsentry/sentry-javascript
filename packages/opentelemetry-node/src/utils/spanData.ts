/* eslint-disable deprecation/deprecation */
import { Transaction } from '@sentry/core';
import type { Context, SpanOrigin } from '@sentry/types';

import { getSentrySpan } from '../spanprocessor';

type SentryTags = Record<string, string>;
type SentryData = Record<string, unknown>;
type Contexts = Record<string, Context>;

/** @deprecated This will be removed in v8. */
export interface AdditionalOtelSpanData {
  data: SentryData;
  tags: SentryTags;
  contexts: Contexts;
  metadata: unknown;
  origin?: SpanOrigin;
}

const OTEL_SPAN_DATA_MAP: Map<string, AdditionalOtelSpanData> = new Map<string, AdditionalOtelSpanData>();

/**
 * Add data that should be added to the sentry span resulting from the given otel span ID.
 * @deprecated This will be removed in v8. This was never meant to be public API.
 */
export function addOtelSpanData(
  otelSpanId: string,
  { data, tags, contexts, metadata, origin }: Partial<AdditionalOtelSpanData>,
): void {
  const sentrySpan = getSentrySpan(otelSpanId);
  if (!sentrySpan) {
    return;
  }

  if (data) {
    Object.keys(data).forEach(prop => {
      const value = data[prop];
      sentrySpan.setData(prop, value);
    });
  }

  if (tags) {
    Object.keys(tags).forEach(prop => {
      sentrySpan.setTag(prop, tags[prop]);
    });
  }

  if (origin) {
    sentrySpan.origin = origin;
  }

  if (sentrySpan instanceof Transaction) {
    if (metadata) {
      sentrySpan.setMetadata(metadata);
    }

    if (contexts) {
      Object.keys(contexts).forEach(prop => {
        sentrySpan.setContext(prop, contexts[prop]);
      });
    }
  }
}

/**
 * @deprecated This will do nothing and will be removed in v8.
 */
export function getOtelSpanData(_otelSpanId: string): AdditionalOtelSpanData {
  return { data: {}, tags: {}, contexts: {}, metadata: {} };
}

/**
 * @deprecated This will do nothing and will be removed in v8.
 */
export function clearOtelSpanData(otelSpanId: string): void {
  OTEL_SPAN_DATA_MAP.delete(otelSpanId);
}
