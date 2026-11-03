import { SENTRY_OP, SENTRY_ORIGIN } from '@sentry/conventions/attributes';
import { MIDDLEWARE } from '@sentry/conventions/op';
import type { StartSpanOptions } from '@sentry/core';

/**
 * Returns span options for TanStack Start middleware spans.
 */
export function getMiddlewareSpanOptions(name: string): StartSpanOptions {
  return {
    name,
    attributes: {
      [SENTRY_ORIGIN]: 'auto.middleware.tanstackstart',
      [SENTRY_OP]: MIDDLEWARE,
    },
  };
}
