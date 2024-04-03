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
import { getSamplingDecision } from './getSamplingDecision';
import { parseSpanDescription } from './parseSpanDescription';
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

  const traceState = span.spanContext().traceState;
  const traceStateDsc = traceState?.get(SENTRY_TRACE_STATE_DSC);

  // If the span has a DSC, we want it to take precedence
  const dscOnSpan = traceStateDsc ? baggageHeaderToDynamicSamplingContext(traceStateDsc) : undefined;

  if (dscOnSpan) {
    return dscOnSpan;
  }

  const dsc = getDynamicSamplingContextFromClient(span.spanContext().traceId, client);

  const attributes = spanHasAttributes(span) ? span.attributes : {};

  const sampleRate = attributes[SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE];
  if (sampleRate != null) {
    dsc.sample_rate = `${sampleRate}`;
  }

  // We don't want to have a transaction name in the DSC if the source is "url" because URLs might contain PII
  const source = attributes[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE];

  // If the span has no name, we assume it is non-recording and want to opt out of using any description
  const { description } = spanHasName(span) ? parseSpanDescription(span) : { description: '' };

  if (source !== 'url' && description) {
    dsc.transaction = description;
  }

  const sampled = getSamplingDecision(span.spanContext());
  if (sampled != null) {
    dsc.sampled = String(sampled);
  }

  client.emit('createDsc', dsc);

  return dsc;
}
