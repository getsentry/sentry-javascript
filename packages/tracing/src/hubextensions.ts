import { getMainCarrier, Hub } from '@sentry/hub';
import { SampleContext, TransactionContext } from '@sentry/types';

import { registerErrorInstrumentation } from './errors';
import { IdleTransaction } from './idletransaction';
import { Transaction } from './transaction';
import { hasTracingEnabled, logger } from '@sentry/utils';

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
 * Use sample rate (given in options as either a constant or ) along with a random number generator to make a sampling
 * decision, which all child spans and child transactions inherit.
 *
 * Sample rate is set in SDK config, either as a constant (`tracesSampleRate`) or a function to compute the rate
 * (`tracesSampler`).
 *
 * Called every time a transaction is created. Only transactions which emerge with sampled === true will be sent to
 * Sentry.
 *
 * Mutates the given Transaction object and then returns the mutated object.
 */
function sample<T extends Transaction>(hub: Hub, transaction: T): T {
  // nothing to do if tracing is disabled
  if (!hasTracingEnabled(hub)) {
    transaction.sampled = false;
    return transaction;
  }

  logger.log('Tracing enabled');

  const client = hub.getClient();
  const options = (client && client.getOptions()) || {};

  // we have to test for a pre-existsing sampling decision, in case this transaction is a child transaction and has
  // inherited its parent's decision
  if (transaction.sampled === undefined) {
    let sampleRate;

    // prefer the hook
    if (options.tracesSampler) {
      // TODO (kmclb) build context object
      const sampleContext: SampleContext = {};
      sampleRate = options.tracesSampler(sampleContext);
    }
    // we would have bailed at the beginning if neither `tracesSampler` nor `tracesSampleRate` were defined, so if the
    // former isn't, the latter must be
    else {
      sampleRate = options.tracesSampleRate;
    }

    // if the function returned either 0 or null, it's a sign the transaction should be dropped
    if (!sampleRate) {
      logger.log('Discarding trace because tracesSampler returned 0 or null');
      transaction.sampled = false;
      return transaction;
    }

    // now we roll the dice (Math.random is inclusive of 0, but not of 1)
    transaction.sampled = Math.random() < sampleRate;

    // if we're not going to keep it, we're done
    if (!transaction.sampled) {
      logger.log(`Discarding trace because it's not included in the random sample (sampling rate = ${sampleRate})`);
      return transaction;
    }
  }

  // at this point we know we're keeping the transaction, whether because of an inherited decision or because it got
  // lucky with the dice roll
  const experimentsOptions = (client && client.getOptions()._experiments) || {};
  transaction.initSpanRecorder(experimentsOptions.maxSpans as number);

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
