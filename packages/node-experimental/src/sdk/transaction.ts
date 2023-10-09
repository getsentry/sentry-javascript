import type { Hub } from '@sentry/core';
import { sampleTransaction, Transaction } from '@sentry/core';
import type {
  ClientOptions,
  CustomSamplingContext,
  Hub as HubInterface,
  Scope,
  TransactionContext,
} from '@sentry/types';
import { uuid4 } from '@sentry/utils';

/**
 * This is a fork of core's tracing/hubextensions.ts _startTransaction,
 * with some OTEL specifics.
 */
export function startTransaction(
  hub: HubInterface,
  transactionContext: TransactionContext,
  customSamplingContext?: CustomSamplingContext,
): Transaction {
  const client = hub.getClient();
  const options: Partial<ClientOptions> = (client && client.getOptions()) || {};

  let transaction = new NodeExperimentalTransaction(transactionContext, hub as Hub);
  transaction = sampleTransaction(transaction, options, {
    parentSampled: transactionContext.parentSampled,
    transactionContext,
    ...customSamplingContext,
  });
  if (transaction.sampled) {
    transaction.initSpanRecorder(options._experiments && (options._experiments.maxSpans as number));
  }
  if (client && client.emit) {
    client.emit('startTransaction', transaction);
  }
  return transaction;
}

/**
 * This is a fork of the base Transaction with OTEL specific stuff added.
 */
export class NodeExperimentalTransaction extends Transaction {
  /**
   * Finish the transaction, but apply the given scope instead of the current one.
   */
  public finishWithScope(endTimestamp?: number, scope?: Scope): string | undefined {
    const event = this._finishTransaction(endTimestamp);

    if (!event) {
      return undefined;
    }

    const client = this._hub.getClient();

    if (!client) {
      return undefined;
    }

    const eventId = uuid4();
    return client.captureEvent(event, { event_id: eventId }, scope);
  }
}
