import { SENTRY_OP } from '@sentry/conventions/attributes';
import { WEB_SERVER_MIDDLEWARE_SPAN_OP } from '@sentry/conventions/op';
import type { StartSpanOptions } from '@sentry/core';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/node';

/**
 * Returns span options for TanStack Start middleware spans.
 */
export function getMiddlewareSpanOptions(name: string): StartSpanOptions {
  return {
    op: WEB_SERVER_MIDDLEWARE_SPAN_OP,
    name,
    attributes: {
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.middleware.tanstackstart',
      [SENTRY_OP]: WEB_SERVER_MIDDLEWARE_SPAN_OP,
    },
  };
}
