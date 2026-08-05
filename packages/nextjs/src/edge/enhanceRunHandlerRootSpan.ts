import { HTTP_METHOD, HTTP_REQUEST_METHOD } from '@sentry/conventions/attributes';
import { SEMANTIC_ATTRIBUTE_SENTRY_SOURCE } from '@sentry/core';
import { ATTR_NEXT_SPAN_NAME, ATTR_NEXT_SPAN_TYPE } from '../common/nextSpanAttributes';
import { ATTR_NEXT_PAGES_API_ROUTE_TYPE } from '../common/span-attributes-with-logic-attached';

export interface MutableRootSpan {
  attributes: Record<string, unknown>;
  getName(): string | undefined;
  setName(name: string): void;
  setOp(op: string): void;
}

/**
 * Normalizes name, op and source for the root span of a pages-router API route on the Edge runtime.
 *
 * We no longer create this transaction ourselves in `wrapApiHandlerWithSentry`, so the root span is the
 * Next.js `Node.runHandler` span. Next.js names it `executing api route (pages) /some/route`, which we
 * turn into a proper `${METHOD} ${route}` transaction with the `http.server` op and `route` source.
 *
 * Applied from both `preprocessEvent` (legacy transaction events) and `processSegmentSpan` (streamed spans),
 * mirroring how `enhanceMiddlewareRootSpan` is wired.
 */
export function enhanceRunHandlerRootSpan(span: MutableRootSpan): void {
  const { attributes } = span;

  if (attributes[ATTR_NEXT_SPAN_TYPE] !== 'Node.runHandler') {
    return;
  }

  const spanName = attributes[ATTR_NEXT_SPAN_NAME];
  if (typeof spanName !== 'string' || !spanName.startsWith(ATTR_NEXT_PAGES_API_ROUTE_TYPE)) {
    return;
  }

  span.setOp('http.server');
  attributes[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE] = 'route';

  const path = spanName.replace(ATTR_NEXT_PAGES_API_ROUTE_TYPE, '').trim();
  // eslint-disable-next-line typescript/no-deprecated
  const method = attributes[HTTP_REQUEST_METHOD] ?? attributes[HTTP_METHOD];
  span.setName(`${typeof method === 'string' ? method : 'GET'} ${path}`);
}
