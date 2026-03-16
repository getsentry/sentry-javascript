import type { Client, Event, Span } from '@sentry/core';
import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, spanToJSON } from '@sentry/core';

const ELYSIA_ORIGIN = 'auto.http.otel.elysia';

const ELYSIA_LIFECYCLE_OP_MAP: Record<string, string> = {
  Request: 'middleware.elysia',
  Parse: 'middleware.elysia',
  Transform: 'middleware.elysia',
  BeforeHandle: 'middleware.elysia',
  Handle: 'request_handler.elysia',
  AfterHandle: 'middleware.elysia',
  MapResponse: 'middleware.elysia',
  AfterResponse: 'middleware.elysia',
  Error: 'middleware.elysia',
};

/**
 * Enrich Elysia lifecycle spans with semantic op and origin,
 * and filter out empty anonymous child spans that Elysia produces.
 */
export function setupClientHooks(client: Client): void {
  // Enrich Elysia lifecycle spans with semantic op and origin.
  // We mutate the attributes directly because the span has already ended
  // and `setAttribute()` is a no-op on ended OTel spans.
  client.on('spanEnd', (span: Span) => {
    const spanData = spanToJSON(span);
    const op = ELYSIA_LIFECYCLE_OP_MAP[spanData.description || ''];
    if (op && spanData.data) {
      const attrs = spanData.data;
      attrs[SEMANTIC_ATTRIBUTE_SENTRY_OP] = op;
      attrs[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN] = ELYSIA_ORIGIN;
    }
  });

  // Filter out empty child spans that Elysia produces for each function handler.
  // Users usually use arrow functions so they show up as <unknown>.
  // We identify Elysia spans by checking if their parent is an Elysia lifecycle span
  // (one we enriched with our origin), so we don't accidentally drop spans from other integrations.
  client.on('beforeSendEvent', (event: Event) => {
    if (event.type === 'transaction' && event.spans) {
      const elysiaSpanIds = new Set<string>();
      const filteredSpans = [];

      for (const span of event.spans) {
        if (span.origin === ELYSIA_ORIGIN) {
          elysiaSpanIds.add(span.span_id);
        }

        const shouldFilter =
          (!span.description || span.description === '<unknown>') &&
          span.parent_span_id &&
          elysiaSpanIds.has(span.parent_span_id);

        if (!shouldFilter) {
          filteredSpans.push(span);
        }
      }

      event.spans = filteredSpans;
    }
  });
}
