import type { DynamicSamplingContext, TraceparentData } from '@sentry/types';
import { baggageHeaderToDynamicSamplingContext, extractTraceparentData } from '@sentry/utils';
import type { RequestEvent } from '@sveltejs/kit';

/**
 * Takes a request event and extracts traceparent and DSC data
 * from the `sentry-trace` and `baggage` DSC headers.
 */
export function getTracePropagationData(event: RequestEvent): {
  traceparentData?: TraceparentData;
  dynamicSamplingContext?: Partial<DynamicSamplingContext>;
} {
  const sentryTraceHeader = event.request.headers.get('sentry-trace');
  const baggageHeader = event.request.headers.get('baggage');
  const traceparentData = sentryTraceHeader ? extractTraceparentData(sentryTraceHeader) : undefined;
  const dynamicSamplingContext = baggageHeaderToDynamicSamplingContext(baggageHeader);

  return { traceparentData, dynamicSamplingContext };
}
