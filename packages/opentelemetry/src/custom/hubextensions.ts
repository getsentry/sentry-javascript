import { addTracingExtensions as _addTracingExtensions, getMainCarrier } from '@sentry/core';
import type { CustomSamplingContext, TransactionContext } from '@sentry/types';

/**
 * Add tracing extensions, ensuring a patched `startTransaction` to work with OTEL.
 */
export function addTracingExtensions(): void {
  _addTracingExtensions();

  const carrier = getMainCarrier();
  if (!carrier.__SENTRY__) {
    return;
  }

  carrier.__SENTRY__.extensions = carrier.__SENTRY__.extensions || {};
  if (carrier.__SENTRY__.extensions.startTransaction !== startTransactionNoop) {
    carrier.__SENTRY__.extensions.startTransaction = startTransactionNoop;
  }
}

function startTransactionNoop(
  _transactionContext: TransactionContext,
  _customSamplingContext?: CustomSamplingContext,
): unknown {
  // eslint-disable-next-line no-console
  console.warn('startTransaction is a noop in @sentry/opentelemetry. Use `startSpan` instead.');
  // We return an object here as hub.ts checks for the result of this
  // and renders a different warning if this is empty
  return {};
}
