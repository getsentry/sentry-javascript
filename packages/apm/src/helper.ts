/**
 * This files exports some global helper functions to make it easier to work with tracing/apm
 */
import { getCurrentHub } from '@sentry/browser';
import { SpanContext } from '@sentry/types';

import { Span } from './span';

/**
 * You need to wrap spans into a transaction in order for them to show up.
 * After this function returns the transaction will be sent to Sentry.
 */
export async function withTransaction(
  name: string,
  spanContext: SpanContext = {},
  callback: (transaction: Span) => Promise<void>,
): Promise<void> {
  return withSpan(
    {
      ...spanContext,
      transaction: name,
    },
    callback,
  );
}

/**
 * Create a span from a callback. Make sure you wrap you `withSpan` calls into a transaction.
 */
export async function withSpan(spanContext: SpanContext = {}, callback?: (span: Span) => Promise<void>): Promise<void> {
  const span = getCurrentHub().startSpan({
    ...spanContext,
  }) as Span;
  if (callback) {
    await callback(span);
  }
  span.finish();
}
