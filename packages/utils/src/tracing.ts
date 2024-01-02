import type { DynamicSamplingContext, PropagationContext, TraceparentData } from '@sentry/types';

import { baggageHeaderToDynamicSamplingContext } from './baggage';
import { uuid4 } from './misc';

// eslint-disable-next-line @sentry-internal/sdk/no-regexp-constructor -- RegExp is used for readability here
export const TRACEPARENT_REGEXP = new RegExp(
  '^[ \\t]*' + // whitespace
    '([0-9a-f]{32})?' + // trace_id
    '-?([0-9a-f]{16})?' + // span_id
    '-?([01])?' + // sampled
    '[ \\t]*$', // whitespace
);

/**
 * Extract transaction context data from a `sentry-trace` header.
 *
 * @param traceparent Traceparent string
 *
 * @returns Object containing data from the header, or undefined if traceparent string is malformed
 */
export function extractTraceparentData(traceparent?: string): TraceparentData | undefined {
  if (!traceparent) {
    return undefined;
  }

  const matches = traceparent.match(TRACEPARENT_REGEXP);
  if (!matches) {
    return undefined;
  }

  let parentSampled: boolean | undefined;
  if (matches[3] === '1') {
    parentSampled = true;
  } else if (matches[3] === '0') {
    parentSampled = false;
  }

  return {
    traceId: matches[1],
    parentSampled,
    parentSpanId: matches[2],
  };
}

/**
 * Create tracing context from incoming headers.
 */
export function tracingContextFromHeaders(
  sentryTrace: Parameters<typeof extractTraceparentData>[0],
  baggage: Parameters<typeof baggageHeaderToDynamicSamplingContext>[0],
): {
  traceparentData: ReturnType<typeof extractTraceparentData>;
  dynamicSamplingContext: ReturnType<typeof baggageHeaderToDynamicSamplingContext>;
  propagationContext: PropagationContext;
} {
  const traceparentData = extractTraceparentData(sentryTrace);
  const dynamicSamplingContext = baggageHeaderToDynamicSamplingContext(baggage);

  const { traceId, parentSpanId, parentSampled } = traceparentData || {};

  const propagationContext: PropagationContext = {
    traceId: traceId || uuid4(),
    spanId: uuid4().substring(16),
    sampled: parentSampled,
  };

  if (parentSpanId) {
    propagationContext.parentSpanId = parentSpanId;
  }

  if (dynamicSamplingContext) {
    propagationContext.dsc = dynamicSamplingContext as DynamicSamplingContext;
  }

  return {
    traceparentData,
    dynamicSamplingContext,
    propagationContext,
  };
}

/**
 * Create sentry-trace header from span context values.
 */
export function generateSentryTraceHeader(
  traceId: string = uuid4(),
  spanId: string = uuid4().substring(16),
  sampled?: boolean,
): string {
  let sampledString = '';
  if (sampled !== undefined) {
    sampledString = sampled ? '-1' : '-0';
  }
  return `${traceId}-${spanId}${sampledString}`;
}
