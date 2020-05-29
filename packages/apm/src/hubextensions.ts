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
 * Starts a Transaction. This is the entry point to do manual tracing. You can
 * add child spans to transactions. Spans themselves can have children, building
 * a tree structure. This function returns a Transaction and you need to keep
 * track of the instance yourself. When you call `.finish()` on the transaction
 * it will be sent to Sentry.
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
 * This function starts a span. If there is already a `Span` on the Scope,
 * the created Span with the SpanContext will have a reference to it and become it's child.
 * Otherwise it'll create a new `Span`.
 *
 * @param context Properties with which the span should be created
 *
 * @deprecated Use startTransaction to start transactions and Transaction.startChild to start spans.
 */
function startSpan(this: Hub, context: SpanContext | TransactionContext): Transaction | Span {
  logger.warn('Deprecated: Use startTransaction to start transactions and Transaction.startChild to start spans.');

  if ((context as TransactionContext).name) {
    return startTransaction(this, context as TransactionContext);
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
      // tslint:disable-next-line: deprecation
      carrier.__SENTRY__.extensions.startSpan = startSpan;
    }
    if (!carrier.__SENTRY__.extensions.traceHeaders) {
      carrier.__SENTRY__.extensions.traceHeaders = traceHeaders;
    }
  }
}
