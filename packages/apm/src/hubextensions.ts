import { getMainCarrier, Hub } from '@sentry/hub';
import { SpanContext, TransactionContext } from '@sentry/types';

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
 * @param spanContext Properties with which the span should be created
 */
function startSpan(spanOrTransactionContext: SpanContext | TransactionContext): Span {
  // @ts-ignore
  const hub = this as Hub;
  const scope = hub.getScope();
  const client = hub.getClient();

  let newSpanContext = spanOrTransactionContext;

  // We create an empty Span in case there is no scope on the hub
  let parentSpan = new Span();
  if (scope) {
    // If there is a Span on the Scope we use the span_id / trace_id
    // To define the parent <-> child relationship
    parentSpan = scope.getSpan() as Span;
    if (parentSpan) {
      const { span_id, trace_id } = parentSpan.getTraceContext();
      newSpanContext = {
        parentSpanId: span_id,
        traceId: trace_id,
        ...spanOrTransactionContext,
      };
    }
  }

  // We are dealing with a Transaction
  if ((newSpanContext as TransactionContext).name) {
    const transaction = new Transaction(newSpanContext as TransactionContext, hub);

    // We only roll the dice on sampling for root spans of transactions because all child spans inherit this state
    if (transaction.sampled === undefined) {
      const sampleRate = (client && client.getOptions().tracesSampleRate) || 0;
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

  return new Span(newSpanContext);
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
