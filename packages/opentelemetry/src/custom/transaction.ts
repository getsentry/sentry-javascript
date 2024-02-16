import type { Hub } from '@sentry/core';
import { Transaction } from '@sentry/core';
import type { ClientOptions, Hub as HubInterface, TransactionContext } from '@sentry/types';

/**
 * This is a fork of core's tracing/hubextensions.ts _startTransaction,
 * with some OTEL specifics.
 */
export function startTransaction(hub: HubInterface, transactionContext: TransactionContext): Transaction {
  // eslint-disable-next-line deprecation/deprecation
  const client = hub.getClient();
  const options: Partial<ClientOptions> = (client && client.getOptions()) || {};

  // eslint-disable-next-line deprecation/deprecation
  const transaction = new Transaction(transactionContext, hub as Hub);
  // Since we do not do sampling here, we assume that this is _always_ sampled
  // Any sampling decision happens in OpenTelemetry's sampler
  transaction.initSpanRecorder(options._experiments && (options._experiments.maxSpans as number));

  if (client) {
    client.emit('startTransaction', transaction);
  }
  return transaction;
}
