import { getMainCarrier, Hub } from '@sentry/hub';
import { SpanContext, TransactionContext } from '@sentry/types';
import { logger } from '@sentry/utils';

import { Span } from './span';
import { Transaction } from './transaction';

/** Returns all trace headers that are currently on the top scope. */
function traceHeaders(): { [key: string]: string } {
  // @ts-ignore
  const that = this as Hub;
  const scope = that.getScope();
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
 * This functions starts a span. If there is already a `Span` on the Scope,
 * the created Span with the SpanContext will have a reference to it and become it's child.
 * Otherwise it'll crete a new `Span`.
 *
 * @param context Properties with which the span should be created
 */
function startSpan(this: Hub, context: SpanContext | TransactionContext): Transaction | Span {
  // This is our safeguard so people always get a Transaction in return.
  // We set `_isTransaction: true` in {@link Sentry.startTransaction} to have a runtime check
  // if the user really wanted to create a Transaction.
  if ((context as TransactionContext)._isTransaction && !(context as TransactionContext).name) {
    logger.warn('You are trying to start a Transaction but forgot to provide a `name` property.');
    logger.warn('Will fall back to <unlabeled transaction>, use `transaction.setName()` to change it.');
    (context as TransactionContext).name = '<unlabeled transaction>';
  }

  if ((context as TransactionContext).name) {
    // We are dealing with a Transaction
    const transaction = new Transaction(context as TransactionContext, this);

    const client = this.getClient();
    // We only roll the dice on sampling for root spans of transactions because all child spans inherit this state
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

  const scope = this.getScope();
  if (scope) {
    // If there is a Span on the Scope we start a child and return that instead
    const parentSpan = scope.getSpan();
    if (parentSpan) {
      return parentSpan.startChild(context);
    }
  }

  // Otherwise we return a new Span
  return new Span(context);
}

/**
 * This patches the global object and injects the APM extensions methods
 */
export function addExtensionMethods(): void {
  const carrier = getMainCarrier();
  if (carrier.__SENTRY__) {
    carrier.__SENTRY__.extensions = carrier.__SENTRY__.extensions || {};
    if (!carrier.__SENTRY__.extensions.startSpan) {
      carrier.__SENTRY__.extensions.startSpan = startSpan;
    }
    if (!carrier.__SENTRY__.extensions.traceHeaders) {
      carrier.__SENTRY__.extensions.traceHeaders = traceHeaders;
    }
  }
}
