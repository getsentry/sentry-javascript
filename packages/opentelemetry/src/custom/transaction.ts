import type { Hub } from '@sentry/core';
import { Transaction } from '@sentry/core';
import type { Hub as HubInterface, TransactionContext } from '@sentry/types';

/**
 * This is a fork of core's tracing/hubextensions.ts _startTransaction,
 * with some OTEL specifics.
 */
export function startTransaction(hub: HubInterface, transactionContext: TransactionContext): Transaction {
  // eslint-disable-next-line deprecation/deprecation
  const client = hub.getClient();

  // eslint-disable-next-line deprecation/deprecation
  const transaction = new Transaction(transactionContext, hub as Hub);

  if (client) {
    client.emit('startTransaction', transaction);
    client.emit('spanStart', transaction);
  }
  return transaction;
}
