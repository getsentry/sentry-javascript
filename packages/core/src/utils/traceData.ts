import type { Client, Scope, Span } from '@sentry/types';
import {
  TRACEPARENT_REGEXP,
  dynamicSamplingContextToSentryBaggageHeader,
  generateSentryTraceHeader,
  logger,
} from '@sentry/utils';
import { getClient, getCurrentScope } from '../currentScopes';
import { getDynamicSamplingContextFromClient, getDynamicSamplingContextFromSpan } from '../tracing';
import { getActiveSpan, getRootSpan, spanToTraceHeader } from './spanUtils';

/**
 * Extracts trace propagation data from the current span or from the client's scope (via transaction or propagation
 * context) and serializes it to `sentry-trace` and `baggage` values to strings. These values can be used to propagate
 * a trace via our tracing Http headers or Html `<meta>` tags.
 *
 * This function also applies some validation to the generated sentry-trace and baggage values to ensure that
 * only valid strings are returned.
 *
 * @param span a span to take the trace data from. By default, the currently active span is used.
 * @param scope the scope to take trace data from By default, the active current scope is used.
 * @param client the SDK's client to take trace data from. By default, the current client is used.
 *
 * @returns an object with the tracing data values. The object keys are the name of the tracing key to be used as header
 * or meta tag name.
 */
export function getTraceData(
  span?: Span | undefined,
  scope?: Scope,
  client?: Client,
): { 'sentry-trace': string; baggage?: string } {
  const clientToUse = client || getClient();
  const scopeToUser = scope || getCurrentScope();
  const spanToUse = span || getActiveSpan();

  const { dsc, sampled, traceId } = scopeToUser.getPropagationContext();
  const rootSpan = spanToUse && getRootSpan(spanToUse);

  const sentryTrace = spanToUse ? spanToTraceHeader(spanToUse) : generateSentryTraceHeader(traceId, undefined, sampled);

  const dynamicSamplingContext = rootSpan
    ? getDynamicSamplingContextFromSpan(rootSpan)
    : dsc
      ? dsc
      : clientToUse
        ? getDynamicSamplingContextFromClient(traceId, clientToUse)
        : undefined;

  const baggage = dynamicSamplingContextToSentryBaggageHeader(dynamicSamplingContext);

  const isValidSentryTraceHeader = TRACEPARENT_REGEXP.test(sentryTrace);
  if (!isValidSentryTraceHeader) {
    logger.warn('Invalid sentry-trace data. Returning empty "sentry-trace" value');
  }

  const validBaggage = isValidBaggageString(baggage);
  if (!validBaggage) {
    logger.warn('Invalid baggage data. Not returning "baggage" value');
  }

  return {
    'sentry-trace': isValidSentryTraceHeader ? sentryTrace : '',
    ...(validBaggage && { baggage }),
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
