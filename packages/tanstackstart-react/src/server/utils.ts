import type { StartSpanOptions } from '@sentry/core';
import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/node';

/**
 * Returns span options for TanStack Start middleware spans.
 */
export function getMiddlewareSpanOptions(name: string): StartSpanOptions {
  return {
    op: 'middleware.tanstackstart',
    name,
    attributes: {
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.middleware.tanstackstart',
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'middleware.tanstackstart',
    },
  };
}
