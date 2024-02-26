import { TraceFlags } from '@opentelemetry/api';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  getClient,
  getDynamicSamplingContextFromClient,
} from '@sentry/core';
import type { DynamicSamplingContext } from '@sentry/types';
import { baggageHeaderToDynamicSamplingContext } from '@sentry/utils';
import { SENTRY_TRACE_STATE_DSC } from '../constants';
import type { AbstractSpan } from '../types';
import { spanHasAttributes, spanHasName } from './spanTypes';

/**
 * Creates a dynamic sampling context from a span (and client and scope)
 *
 * @param span the span from which a few values like the root span name and sample rate are extracted.
 *
 * @returns a dynamic sampling context
 */
export function getDynamicSamplingContextFromSpan(span: AbstractSpan): Readonly<Partial<DynamicSamplingContext>> {
  const client = getClient();
  if (!client) {
    return {};
  }

  const dsc = getDynamicSamplingContextFromClient(span.spanContext().traceId, client);

  const traceState = span.spanContext().traceState;
  const traceStateDsc = traceState?.get(SENTRY_TRACE_STATE_DSC);

  if (traceStateDsc) {
    const dsc = baggageHeaderToDynamicSamplingContext(traceStateDsc);
    if (dsc) {
      return dsc;
    }
  }

  const attributes = spanHasAttributes(span) ? span.attributes : {};

  const sampleRate = attributes[SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE];
  if (sampleRate != null) {
    dsc.sample_rate = `${sampleRate}`;
  }

  // We don't want to have a transaction name in the DSC if the source is "url" because URLs might contain PII
  const source = attributes[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE];
  const name = spanHasName(span) ? span.name : '';

  if (source !== 'url' && name) {
    dsc.transaction = name;
  }

  // eslint-disable-next-line no-bitwise
  const sampled = Boolean(span.spanContext().traceFlags & TraceFlags.SAMPLED);
  dsc.sampled = String(sampled);

  client.emit('createDsc', dsc);

  return dsc;
}
