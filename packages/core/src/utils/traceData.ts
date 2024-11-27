import type { Scope, SerializedTraceData, Span } from '@sentry/types';
import { getAsyncContextStrategy } from '../asyncContext';
import { getMainCarrier } from '../carrier';
import { getClient, getCurrentScope } from '../currentScopes';
import { isEnabled } from '../exports';
import { getDynamicSamplingContextFromScope, getDynamicSamplingContextFromSpan } from '../tracing';
import { dynamicSamplingContextToSentryBaggageHeader } from '../utils-hoist/baggage';
import { logger } from '../utils-hoist/logger';
import { TRACEPARENT_REGEXP, generateSentryTraceHeader } from '../utils-hoist/tracing';
import { getActiveSpan, spanToTraceHeader } from './spanUtils';

/**
 * Extracts trace propagation data from the current span or from the client's scope (via transaction or propagation
 * context) and serializes it to `sentry-trace` and `baggage` values to strings. These values can be used to propagate
 * a trace via our tracing Http headers or Html `<meta>` tags.
 *
 * This function also applies some validation to the generated sentry-trace and baggage values to ensure that
 * only valid strings are returned.
 *
 * @returns an object with the tracing data values. The object keys are the name of the tracing key to be used as header
 * or meta tag name.
 */
export function getTraceData(options: { span?: Span } = {}): SerializedTraceData {
  const client = getClient();
  if (!isEnabled() || !client) {
    return {};
  }

  const carrier = getMainCarrier();
  const acs = getAsyncContextStrategy(carrier);
  if (acs.getTraceData) {
    return acs.getTraceData(options);
  }

  const scope = getCurrentScope();
  const span = options.span || getActiveSpan();
  const sentryTrace = span ? spanToTraceHeader(span) : scopeToTraceHeader(scope);
  const dsc = span ? getDynamicSamplingContextFromSpan(span) : getDynamicSamplingContextFromScope(client, scope);
  const baggage = dynamicSamplingContextToSentryBaggageHeader(dsc);

  const isValidSentryTraceHeader = TRACEPARENT_REGEXP.test(sentryTrace);
  if (!isValidSentryTraceHeader) {
    logger.warn('Invalid sentry-trace data. Cannot generate trace data');
    return {};
  }

  return {
    'sentry-trace': sentryTrace,
    baggage,
  };
}

/**
 * Get a sentry-trace header value for the given scope.
 */
function scopeToTraceHeader(scope: Scope): string {
  // TODO(v9): Use generateSpanId() instead of spanId
  // eslint-disable-next-line deprecation/deprecation
  const { traceId, sampled, spanId } = scope.getPropagationContext();
  return generateSentryTraceHeader(traceId, spanId, sampled);
}
