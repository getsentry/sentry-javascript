import { stripUrlQueryAndFragment } from '@sentry/core';
import { ATTR_NEXT_SPAN_NAME, ATTR_NEXT_SPAN_TYPE } from '../common/nextSpanAttributes';

export interface MutableMiddlewareRootSpan {
  attributes: Record<string, unknown>;
  getName(): string | undefined;
  setName(name: string): void;
}

/**
 * Normalizes the transaction name for the root span of a Next.js `Middleware.execute` request on the Edge runtime.
 *
 * Older Next.js versions append the full URL to the middleware span name (e.g. `middleware GET /foo?bar=1`),
 * producing high-cardinality transaction names. We collapse the name to `middleware {METHOD}` when possible,
 * and strip query/fragment otherwise.
 *
 * Called from two places that operate on different shapes of the same underlying root span:
 * - Legacy mode: from `preprocessEvent`, adapted around a transaction `Event` whose `contexts.trace.data`
 *   holds the root span's attributes and whose `event.transaction` is the root span's name.
 * - Streamed mode: from `processSegmentSpan`, adapted around a `StreamedSpanJSON` (the streamed
 *   counterpart of the legacy transaction root) directly.
 */
export function enhanceMiddlewareRootSpan(span: MutableMiddlewareRootSpan): void {
  const { attributes } = span;

  if (attributes[ATTR_NEXT_SPAN_TYPE] !== 'Middleware.execute') {
    return;
  }

  const spanName = attributes[ATTR_NEXT_SPAN_NAME];
  if (typeof spanName !== 'string' || !spanName || !span.getName()) {
    return;
  }

  const match = spanName.match(/^middleware (GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)/);
  if (match) {
    span.setName(`middleware ${match[1]}`);
  } else {
    span.setName(stripUrlQueryAndFragment(spanName));
  }
}
