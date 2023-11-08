import type { Hub } from '@sentry/core';
import { getDynamicSamplingContextFromClient } from '@sentry/core';
import type { Span } from '@sentry/types';
import { dynamicSamplingContextToSentryBaggageHeader, generateSentryTraceHeader } from '@sentry/utils';

/**
 * Extracts the tracing data from the current span or from the client's scope
 * (via transaction or propagation context) and renders the data to <meta> tags.
 *
 * This function creates two serialized <meta> tags:
 * - `<meta name="sentry-trace" content="..."/>`
 * - `<meta name="baggage" content="..."/>`
 *
 * TODO: Extract this later on and export it from the Core or Node SDK
 *
 * @param span the currently active span
 * @param client the SDK's client
 *
 * @returns an object with the two serialized <meta> tags
 */
export function getTracingMetaTags(span: Span | undefined, hub: Hub): { sentryTrace: string; baggage?: string } {
  const scope = hub.getScope();
  const client = hub.getClient();
  const { dsc, sampled, traceId } = scope.getPropagationContext();
  const transaction = span?.transaction;

  const sentryTrace = span ? span.toTraceparent() : generateSentryTraceHeader(traceId, undefined, sampled);

  const dynamicSamplingContext = transaction
    ? transaction.getDynamicSamplingContext()
    : dsc
    ? dsc
    : client
    ? getDynamicSamplingContextFromClient(traceId, client, scope)
    : undefined;

  const baggage = dynamicSamplingContextToSentryBaggageHeader(dynamicSamplingContext);

  return {
    sentryTrace: `<meta name="sentry-trace" content="${sentryTrace}"/>`,
    baggage: baggage ? `<meta name="baggage" content="${baggage}"/>` : undefined,
  };
}
