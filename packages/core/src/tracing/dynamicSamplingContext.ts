import type { Client, DynamicSamplingContext, Span } from '@sentry/types';
import { dropUndefinedKeys } from '@sentry/utils';

import { DEFAULT_ENVIRONMENT } from '../constants';
import { getClient } from '../currentScopes';
import { SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE, SEMANTIC_ATTRIBUTE_SENTRY_SOURCE } from '../semanticAttributes';
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
  const rootSpan = getRootSpan(span);
  if (!rootSpan) {
    return dsc;
  }

  // We don't want to have a transaction name in the DSC if the source is "url" because URLs might contain PII
  const jsonSpan = spanToJSON(rootSpan);
  const data = jsonSpan.data || {};

  const source = data[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE];
  const maybeSampleRate = data[SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE];
  if (maybeSampleRate != null) {
    dsc.sample_rate = `${maybeSampleRate}`;
  }

  // after JSON conversion, txn.name becomes jsonSpan.description
  if (source && source !== 'url') {
    dsc.transaction = jsonSpan.description;
  }

  dsc.sampled = String(spanIsSampled(rootSpan));

  client.emit('createDsc', dsc);

  return dsc;
}
