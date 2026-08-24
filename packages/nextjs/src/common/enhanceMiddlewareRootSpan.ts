import { WEB_SERVER_MIDDLEWARE_SPAN_OP } from '@sentry/conventions/op';
import { SENTRY_SEGMENT_NAME_SOURCE } from '@sentry/conventions/attributes';

import { stripUrlQueryAndFragment } from '@sentry/core';
import { ATTR_NEXT_SPAN_NAME, ATTR_NEXT_SPAN_TYPE } from './nextSpanAttributes';

export interface MutableMiddlewareRootSpan {
  attributes: Record<string, unknown>;
  getName(): string | undefined;
  setName(name: string): void;
  setOp(op: string): void;
}

/**
 * Normalizes the transaction name and op for the root span of a Next.js `Middleware.execute` request.
 *
 * On the Edge runtime, middleware always runs in a detached sandbox, so `Middleware.execute` is the root span.
 * On the Node.js runtime, this is the case since vercel/next.js#95306, where in-process
 * middleware runs in a detached OTel context instead of inside the `BaseServer.handleRequest` span.
 *
 * Older Next.js versions append the full URL to the middleware span name (e.g. `middleware GET /foo?bar=1`),
 * producing high-cardinality transaction names. We collapse the name to `middleware {METHOD}` when possible,
 * and strip query/fragment otherwise.
 */
export function enhanceMiddlewareRootSpan(span: MutableMiddlewareRootSpan): void {
  const { attributes } = span;

  if (attributes[ATTR_NEXT_SPAN_TYPE] !== 'Middleware.execute') {
    return;
  }

  span.setOp(WEB_SERVER_MIDDLEWARE_SPAN_OP);

  const spanName = attributes[ATTR_NEXT_SPAN_NAME];
  if (typeof spanName !== 'string' || !spanName || !span.getName()) {
    return;
  }

  const match = spanName.match(/^middleware (GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)/);
  if (match) {
    span.setName(`middleware ${match[1]}`);
    attributes[SENTRY_SEGMENT_NAME_SOURCE] = 'route';
  } else {
    span.setName(stripUrlQueryAndFragment(spanName));
  }
}
