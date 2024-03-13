import type { DsnComponents, SpanEnvelope, SpanItem } from '@sentry/types';
import type { Span } from '@sentry/types';
import { createEnvelope, dsnToString } from '@sentry/utils';

/**
 * Create envelope from Span item.
 */
export function createSpanEnvelope(spans: Span[], dsn?: DsnComponents): SpanEnvelope {
  const headers: SpanEnvelope[0] = {
    sent_at: new Date().toISOString(),
  };

  if (dsn) {
    headers.dsn = dsnToString(dsn);
  }

  const items = spans.map(createSpanItem);
  return createEnvelope<SpanEnvelope>(headers, items);
}

function createSpanItem(span: Span): SpanItem {
  const spanHeaders: SpanItem[0] = {
    type: 'span',
  };
  return [spanHeaders, span];
}
