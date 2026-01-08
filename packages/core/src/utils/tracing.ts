import type { Client } from '../client';
import type { DynamicSamplingContext } from '../types-hoist/envelope';
import type { PropagationContext } from '../types-hoist/tracing';
import type { TraceparentData } from '../types-hoist/transaction';
import { debug } from '../utils/debug-logger';
import { baggageHeaderToDynamicSamplingContext } from './baggage';
import { extractOrgIdFromClient } from './dsn';
import { parseSampleRate } from './parseSampleRate';
import { generateSpanId, generateTraceId } from './propagationContext';
import { safeMathRandom } from './randomSafeContext';

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
 * This is terrible naming but the function has nothing to do with the W3C traceparent header.
 * It can only parse the `sentry-trace` header and extract the "trace parent" data.
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

  if (!traceparentData?.traceId) {
    return {
      traceId: generateTraceId(),
      sampleRand: safeMathRandom(),
    };
  }

  const sampleRand = getSampleRandFromTraceparentAndDsc(traceparentData, dynamicSamplingContext);

  // The sample_rand on the DSC needs to be generated based on traceparent + baggage.
  if (dynamicSamplingContext) {
    dynamicSamplingContext.sample_rand = sampleRand.toString();
  }

  const { traceId, parentSpanId, parentSampled } = traceparentData;

  return {
    traceId,
    parentSpanId,
    sampled: parentSampled,
    dsc: dynamicSamplingContext || {}, // If we have traceparent data but no DSC it means we are not head of trace and we must freeze it
    sampleRand,
  };
}

/**
 * Create sentry-trace header from span context values.
 */
export function generateSentryTraceHeader(
  traceId: string | undefined = generateTraceId(),
  spanId: string | undefined = generateSpanId(),
  sampled?: boolean,
): string {
  let sampledString = '';
  if (sampled !== undefined) {
    sampledString = sampled ? '-1' : '-0';
  }
  return `${traceId}-${spanId}${sampledString}`;
}

/**
 * Creates a W3C traceparent header from the given trace and span ids.
 */
export function generateTraceparentHeader(
  traceId: string | undefined = generateTraceId(),
  spanId: string | undefined = generateSpanId(),
  sampled?: boolean,
): string {
  return `00-${traceId}-${spanId}-${sampled ? '01' : '00'}`;
}

/**
 * Given any combination of an incoming trace, generate a sample rand based on its defined semantics.
 *
 * Read more: https://develop.sentry.dev/sdk/telemetry/traces/#propagated-random-value
 */
function getSampleRandFromTraceparentAndDsc(
  traceparentData: TraceparentData | undefined,
  dsc: Partial<DynamicSamplingContext> | undefined,
): number {
  // When there is an incoming sample rand use it.
  const parsedSampleRand = parseSampleRate(dsc?.sample_rand);
  if (parsedSampleRand !== undefined) {
    return parsedSampleRand;
  }

  // Otherwise, if there is an incoming sampling decision + sample rate, generate a sample rand that would lead to the same sampling decision.
  const parsedSampleRate = parseSampleRate(dsc?.sample_rate);
  if (parsedSampleRate && traceparentData?.parentSampled !== undefined) {
    return traceparentData.parentSampled
      ? // Returns a sample rand with positive sampling decision [0, sampleRate)
        safeMathRandom() * parsedSampleRate
      : // Returns a sample rand with negative sampling decision [sampleRate, 1)
        parsedSampleRate + safeMathRandom() * (1 - parsedSampleRate);
  } else {
    // If nothing applies, return a random sample rand.
    return safeMathRandom();
  }
}

/**
 * Determines whether a new trace should be continued based on the provided baggage org ID and the client's `strictTraceContinuation` option.
 * If the trace should not be continued, a new trace will be started.
 *
 * The result is dependent on the `strictTraceContinuation` option in the client.
 * See https://develop.sentry.dev/sdk/telemetry/traces/#stricttracecontinuation
 */
export function shouldContinueTrace(client: Client, baggageOrgId?: string): boolean {
  const clientOrgId = extractOrgIdFromClient(client);

  // Case: baggage orgID and Client orgID don't match - always start new trace
  if (baggageOrgId && clientOrgId && baggageOrgId !== clientOrgId) {
    debug.log(
      `Won't continue trace because org IDs don't match (incoming baggage: ${baggageOrgId}, SDK options: ${clientOrgId})`,
    );
    return false;
  }

  const strictTraceContinuation = client.getOptions().strictTraceContinuation || false; // default for `strictTraceContinuation` is `false`

  if (strictTraceContinuation) {
    // With strict continuation enabled, don't continue trace if:
    // - Baggage has orgID, but Client doesn't have one
    // - Client has orgID, but baggage doesn't have one
    if ((baggageOrgId && !clientOrgId) || (!baggageOrgId && clientOrgId)) {
      debug.log(
        `Starting a new trace because strict trace continuation is enabled but one org ID is missing (incoming baggage: ${baggageOrgId}, Sentry client: ${clientOrgId})`,
      );
      return false;
    }
  }

  return true;
}
