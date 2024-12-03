import type { PropagationContext, TraceparentData } from '../types-hoist';

import { baggageHeaderToDynamicSamplingContext } from './baggage';
import { generateSpanId, generateTraceId } from './propagationContext';

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
 * Create a propagation context from incoming headers or
 * creates a minimal new one if the headers are undefined.
 */
export function propagationContextFromHeaders(
  sentryTrace: string | undefined,
  baggage: string | number | boolean | string[] | null | undefined,
): PropagationContext {
  const traceparentData = extractTraceparentData(sentryTrace);
  const dynamicSamplingContext = baggageHeaderToDynamicSamplingContext(baggage);

  if (!traceparentData || !traceparentData.traceId) {
    return { traceId: generateTraceId(), spanId: generateSpanId() };
  }

  const { traceId, parentSpanId, parentSampled } = traceparentData;

  const virtualSpanId = generateSpanId();

  return {
    traceId,
    parentSpanId,
    spanId: virtualSpanId,
    sampled: parentSampled,
    dsc: dynamicSamplingContext || {}, // If we have traceparent data but no DSC it means we are not head of trace and we must freeze it
  };
}

/**
 * Create sentry-trace header from span context values.
 */
export function generateSentryTraceHeader(
  traceId: string = generateTraceId(),
  spanId: string = generateSpanId(),
  sampled?: boolean,
): string {
  let sampledString = '';
  if (sampled !== undefined) {
    sampledString = sampled ? '-1' : '-0';
  }
  return `${traceId}-${spanId}${sampledString}`;
}
