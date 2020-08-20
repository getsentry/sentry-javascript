import { getMainCarrier, Hub } from '@sentry/hub';
import { TransactionContext } from '@sentry/types';

import { registerErrorInstrumentation } from './errors';
import { IdleTransaction } from './idletransaction';
import { Transaction } from './transaction';

/** Returns all trace headers that are currently on the top scope. */
function traceHeaders(this: Hub): { [key: string]: string } {
  const scope = this.getScope();
  if (scope) {
    const span = scope.getSpan();
    if (span) {
      return {
        'sentry-trace': span.toTraceparent(),
      };
    }
  }
  return {};
}

/**
 * Use RNG to generate sampling decision, which all child spans inherit.
 */
function sample<T extends Transaction>(hub: Hub, transaction: T): T {
  const client = hub.getClient();
  if (transaction.sampled === undefined) {
    const sampleRate = (client && client.getOptions().tracesSampleRate) || 0;
    // if true = we want to have the transaction
    // if false = we don't want to have it
    // Math.random (inclusive of 0, but not 1)
    transaction.sampled = Math.random() < sampleRate;
  }

  // We only want to create a span list if we sampled the transaction
  // If sampled == false, we will discard the span anyway, so we can save memory by not storing child spans
  if (transaction.sampled) {
    const experimentsOptions = (client && client.getOptions()._experiments) || {};
    transaction.initSpanRecorder(experimentsOptions.maxSpans as number);
  }

  return transaction;
}

/**
 * {@see Hub.startTransaction}
 */
function startTransaction(this: Hub, context: TransactionContext): Transaction {
  const transaction = new Transaction(context, this);
  return sample(this, transaction);
}

/**
 * Create new idle transaction.
 */
export function startIdleTransaction(
  hub: Hub,
  context: TransactionContext,
  idleTimeout?: number,
  onScope?: boolean,
): IdleTransaction {
  const transaction = new IdleTransaction(context, hub, idleTimeout, onScope);
  return sample(hub, transaction);
}

/**
 * @private
 */
export function _addTracingExtensions(): void {
  const carrier = getMainCarrier();
  if (carrier.__SENTRY__) {
    carrier.__SENTRY__.extensions = carrier.__SENTRY__.extensions || {};
    if (!carrier.__SENTRY__.extensions.startTransaction) {
      carrier.__SENTRY__.extensions.startTransaction = startTransaction;
    }
    if (!carrier.__SENTRY__.extensions.traceHeaders) {
      carrier.__SENTRY__.extensions.traceHeaders = traceHeaders;
    }
  }
}

/**
 * This patches the global object and injects the Tracing extensions methods
 */
export function addExtensionMethods(): void {
  _addTracingExtensions();

  // If an error happens globally, we should make sure transaction status is set to error.
  registerErrorInstrumentation();
}
