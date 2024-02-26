import type { SpanEnvelope, SpanItem } from '@sentry/types';
import type { Span } from '@sentry/types';
import { createEnvelope } from '@sentry/utils';

/**
 * Create envelope from Span item.
 */
export function createSpanEnvelope(spans: Span[]): SpanEnvelope {
  const headers: SpanEnvelope[0] = {
    sent_at: new Date().toISOString(),
  };

  const items = spans.map(createSpanItem);
  return createEnvelope<SpanEnvelope>(headers, items);
}

function createSpanItem(span: Span): SpanItem {
  const spanHeaders: SpanItem[0] = {
    type: 'span',
  };
  return [spanHeaders, span];
}
