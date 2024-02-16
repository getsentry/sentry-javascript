import type { SpanEnvelope, SpanItem } from '@sentry/types';
import type { Span } from '@sentry/types/build/types/span';
import { createEnvelope } from '@sentry/utils';

/**
 * Create envelope from Span item.
 */
export function createSpanEnvelope(span: Span): SpanEnvelope {
  const headers: SpanEnvelope[0] = {
    sent_at: new Date().toISOString(),
  };

  const item = createSpanItem(span);
  return createEnvelope<SpanEnvelope>(headers, [item]);
}

function createSpanItem(span: Span): SpanItem {
  const spanHeaders: SpanItem[0] = {
    type: 'span',
  };
  return [spanHeaders, span];
}
