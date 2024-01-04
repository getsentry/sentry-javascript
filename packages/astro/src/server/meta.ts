import { getDynamicSamplingContextFromClient, spanToTraceHeader } from '@sentry/core';
import type { Client, Scope, Span } from '@sentry/types';
import {
  TRACEPARENT_REGEXP,
  dynamicSamplingContextToSentryBaggageHeader,
  generateSentryTraceHeader,
  logger,
} from '@sentry/utils';

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
export function getTracingMetaTags(
  span: Span | undefined,
  scope: Scope,
  client: Client | undefined,
): { sentryTrace: string; baggage?: string } {
  const { dsc, sampled, traceId } = scope.getPropagationContext();
  const transaction = span?.transaction;

  const sentryTrace = span ? spanToTraceHeader(span) : generateSentryTraceHeader(traceId, undefined, sampled);

  const dynamicSamplingContext = transaction
    ? transaction.getDynamicSamplingContext()
    : dsc
      ? dsc
      : client
        ? getDynamicSamplingContextFromClient(traceId, client, scope)
        : undefined;

  const baggage = dynamicSamplingContextToSentryBaggageHeader(dynamicSamplingContext);

  const isValidSentryTraceHeader = TRACEPARENT_REGEXP.test(sentryTrace);
  if (!isValidSentryTraceHeader) {
    logger.warn('Invalid sentry-trace data. Returning empty <meta name="sentry-trace"/> tag');
  }

  const validBaggage = isValidBaggageString(baggage);
  if (!validBaggage) {
    logger.warn('Invalid baggage data. Returning empty <meta name="baggage"/> tag');
  }

  return {
    sentryTrace: `<meta name="sentry-trace" content="${isValidSentryTraceHeader ? sentryTrace : ''}"/>`,
    baggage: baggage && `<meta name="baggage" content="${validBaggage ? baggage : ''}"/>`,
  };
}

/**
 * Tests string against baggage spec as defined in:
 *
 * - W3C Baggage grammar: https://www.w3.org/TR/baggage/#definition
 * - RFC7230 token definition: https://datatracker.ietf.org/doc/html/rfc7230#section-3.2.6
 *
 * exported for testing
 */
export function isValidBaggageString(baggage?: string): boolean {
  if (!baggage || !baggage.length) {
    return false;
  }
  const keyRegex = "[-!#$%&'*+.^_`|~A-Za-z0-9]+";
  const valueRegex = '[!#-+-./0-9:<=>?@A-Z\\[\\]a-z{-}]+';
  const spaces = '\\s*';
  // eslint-disable-next-line @sentry-internal/sdk/no-regexp-constructor -- RegExp for readability, no user input
  const baggageRegex = new RegExp(
    `^${keyRegex}${spaces}=${spaces}${valueRegex}(${spaces},${spaces}${keyRegex}${spaces}=${spaces}${valueRegex})*$`,
  );
  return baggageRegex.test(baggage);
}
