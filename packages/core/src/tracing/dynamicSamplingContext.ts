import type { Client, DynamicSamplingContext, Scope, Span, Transaction, TransactionSource } from '@sentry/types';
import { dropUndefinedKeys } from '@sentry/utils';

import { DEFAULT_ENVIRONMENT } from '../constants';
import { getClient, getCurrentScope } from '../exports';
import { SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE, SEMANTIC_ATTRIBUTE_SENTRY_SOURCE } from '../semanticAttributes';
import { spanIsSampled, spanToJSON } from '../utils/spanUtils';

/**
 * Creates a dynamic sampling context from a client.
 *
 * Dispatches the `createDsc` lifecycle hook as a side effect.
 */
export function getDynamicSamplingContextFromClient(
  trace_id: string,
  client: Client,
  scope?: Scope,
): DynamicSamplingContext {
  const options = client.getOptions();

  const { publicKey: public_key } = client.getDsn() || {};
  const { segment: user_segment } = (scope && scope.getUser()) || {};

  const dsc = dropUndefinedKeys({
    environment: options.environment || DEFAULT_ENVIRONMENT,
    release: options.release,
    user_segment,
    public_key,
    trace_id,
  }) as DynamicSamplingContext;

  client.emit && client.emit('createDsc', dsc);

  return dsc;
}

/**
 * A Span with a frozen dynamic sampling context.
 */
type TransactionWithV7FrozenDsc = Transaction & { _frozenDynamicSamplingContext?: DynamicSamplingContext };

/**
 * Creates a dynamic sampling context from a span (and client and scope)
 *
 * @param span the span from which a few values like the root span name and sample rate are extracted.
 *
 * @returns a dynamic sampling context
 */
export function getDynamicSamplingContextFromSpan(span: Span): Readonly<Partial<DynamicSamplingContext>> {
  const client = getClient();
  if (!client) {
    return {};
  }

  // passing emit=false here to only emit later once the DSC is actually populated
  const dsc = getDynamicSamplingContextFromClient(spanToJSON(span).trace_id || '', client, getCurrentScope());

  // As long as we use `Transaction`s internally, this should be fine.
  // TODO: We need to replace this with a `getRootSpan(span)` function though
  const txn = span.transaction as TransactionWithV7FrozenDsc | undefined;
  if (!txn) {
    return dsc;
  }

  // TODO (v8): Remove v7FrozenDsc as a Transaction will no longer have _frozenDynamicSamplingContext
  // For now we need to avoid breaking users who directly created a txn with a DSC, where this field is still set.
  // @see Transaction class constructor
  const v7FrozenDsc = txn && txn._frozenDynamicSamplingContext;
  if (v7FrozenDsc) {
    return v7FrozenDsc;
  }

  const maybeSampleRate = txn.attributes[SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE] as number | undefined;
  if (maybeSampleRate != null) {
    dsc.sample_rate = `${maybeSampleRate}`;
  }

  // We don't want to have a transaction name in the DSC if the source is "url" because URLs might contain PII
  const source = txn.attributes[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE] as TransactionSource | undefined;
  const jsonSpan = spanToJSON(txn);

  // after JSON conversion, txn.name becomes jsonSpan.description
  if (source && source !== 'url') {
    dsc.transaction = jsonSpan.description;
  }

  dsc.sampled = String(spanIsSampled(txn));

  client.emit && client.emit('createDsc', dsc);

  return dsc;
}
