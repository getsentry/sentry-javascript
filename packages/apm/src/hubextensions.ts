import { getMainCarrier, Hub } from '@sentry/hub';
import { SpanContext, TransactionContext } from '@sentry/types';
import { logger } from '@sentry/utils';

import { Span } from './span';
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
 * {@see Hub.startTransaction}
 */
function startTransaction(this: Hub, context: TransactionContext): Transaction {
  const transaction = new Transaction(context, this);

  const client = this.getClient();
  // Roll the dice for sampling transaction, all child spans inherit the sampling decision.
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
 * {@see Hub.startSpan}
 */
function startSpan(this: Hub, context: SpanContext): Transaction | Span {
  /**
   * @deprecated
   * This is here to make sure we don't break users that relied on calling startSpan to create a transaction
   * with the transaction poperty set.
   */
  if ((context as any).transaction !== undefined) {
    logger.warn(`Use \`Sentry.startTransaction({name: ${(context as any).transaction}})\` to start a Transaction.`);
    (context as TransactionContext).name = (context as any).transaction as string;
  }

  // We have the check of not undefined since we defined it's ok to start a transaction with an empty name
  // tslint:disable-next-line: strict-type-predicates
  if ((context as TransactionContext).name !== undefined) {
    return this.startTransaction(context as TransactionContext);
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
    if (!carrier.__SENTRY__.extensions.startTransaction) {
      carrier.__SENTRY__.extensions.startTransaction = startTransaction;
    }
    if (!carrier.__SENTRY__.extensions.startSpan) {
      carrier.__SENTRY__.extensions.startSpan = startSpan;
    }
    if (!carrier.__SENTRY__.extensions.traceHeaders) {
      carrier.__SENTRY__.extensions.traceHeaders = traceHeaders;
    }
  }
}
