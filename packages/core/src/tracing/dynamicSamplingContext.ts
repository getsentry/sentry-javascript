import type { Client, DynamicSamplingContext, Span, Transaction } from '@sentry/types';
import { dropUndefinedKeys } from '@sentry/utils';

import { DEFAULT_ENVIRONMENT } from '../constants';
import { getClient } from '../currentScopes';
import { SEMANTIC_ATTRIBUTE_SENTRY_SOURCE } from '../semanticAttributes';
import { getRootSpan, spanIsSampled, spanToJSON } from '../utils/spanUtils';

/**
 * Creates a dynamic sampling context from a client.
 *
 * Dispatches the `createDsc` lifecycle hook as a side effect.
 */
export function getDynamicSamplingContextFromClient(trace_id: string, client: Client): DynamicSamplingContext {
  const options = client.getOptions();

  const { publicKey: public_key } = client.getDsn() || {};

  const dsc = dropUndefinedKeys({
    environment: options.environment || DEFAULT_ENVIRONMENT,
    release: options.release,
    public_key,
    trace_id,
  }) as DynamicSamplingContext;

  client.emit('createDsc', dsc);

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

  const dsc = getDynamicSamplingContextFromClient(spanToJSON(span).trace_id || '', client);

  // TODO (v8): Remove v7FrozenDsc as a Transaction will no longer have _frozenDynamicSamplingContext
  const rootSpan = getRootSpan(span);
  if (!rootSpan) {
    return dsc;
  }

  // TODO (v8): Remove v7FrozenDsc as a Transaction will no longer have _frozenDynamicSamplingContext
  // For now we need to avoid breaking users who directly created a txn with a DSC, where this field is still set.
  // @see Transaction class constructor
  const v7FrozenDsc = rootSpan && (rootSpan as TransactionWithV7FrozenDsc)._frozenDynamicSamplingContext;
  if (v7FrozenDsc) {
    return v7FrozenDsc;
  }

  // TODO (v8): Replace txn.metadata with txn.attributes[]
  // We can't do this yet because attributes aren't always set yet.
  // eslint-disable-next-line deprecation/deprecation
  const { sampleRate: maybeSampleRate } = (rootSpan as TransactionWithV7FrozenDsc).metadata || {};
  if (maybeSampleRate != null) {
    dsc.sample_rate = `${maybeSampleRate}`;
  }

  // We don't want to have a transaction name in the DSC if the source is "url" because URLs might contain PII
  const jsonSpan = spanToJSON(rootSpan);

  const source = (jsonSpan.data || {})[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE];

  // after JSON conversion, txn.name becomes jsonSpan.description
  if (source && source !== 'url') {
    dsc.transaction = jsonSpan.description;
  }

  dsc.sampled = String(spanIsSampled(rootSpan));

  client.emit('createDsc', dsc);

  return dsc;
}
