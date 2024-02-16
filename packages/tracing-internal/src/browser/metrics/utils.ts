import type { Transaction } from '@sentry/core';
import type { Span, SpanContext } from '@sentry/types';

/**
 * Checks if a given value is a valid measurement value.
 */
export function isMeasurementValue(value: unknown): value is number {
  return typeof value === 'number' && isFinite(value);
}

/**
 * Helper function to start child on transactions. This function will make sure that the transaction will
 * use the start timestamp of the created child span if it is earlier than the transactions actual
 * start timestamp.
 *
 * Note: this will not be possible anymore in v8,
 * unless we do some special handling for browser here...
 */
export function _startChild(transaction: Transaction, { startTimestamp, ...ctx }: SpanContext): Span {
  // eslint-disable-next-line deprecation/deprecation
  if (startTimestamp && transaction.startTimestamp > startTimestamp) {
    // eslint-disable-next-line deprecation/deprecation
    transaction.startTimestamp = startTimestamp;
  }

  // eslint-disable-next-line deprecation/deprecation
  return transaction.startChild({
    startTimestamp,
    ...ctx,
  });
}
