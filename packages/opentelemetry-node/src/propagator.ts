import {
  Context,
  isSpanContextValid,
  TextMapGetter,
  TextMapPropagator,
  TextMapSetter,
  trace,
  TraceFlags,
} from '@opentelemetry/api';
import { isTracingSuppressed } from '@opentelemetry/core';
import {
  baggageHeaderToDynamicSamplingContext,
  dynamicSamplingContextToSentryBaggageHeader,
  extractTraceparentData,
} from '@sentry/utils';

import {
  SENTRY_BAGGAGE_HEADER,
  SENTRY_DYNAMIC_SAMPLING_CONTEXT_KEY,
  SENTRY_TRACE_HEADER,
  SENTRY_TRACE_PARENT_CONTEXT_KEY,
} from './constants';
import { SENTRY_SPAN_PROCESSOR_MAP } from './spanprocessor';

/**
 * Injects and extracts `sentry-trace` and `baggage` headers from carriers.
 */
export class SentryPropagator implements TextMapPropagator {
  /**
   * @inheritDoc
   */
  public inject(context: Context, carrier: unknown, setter: TextMapSetter): void {
    const spanContext = trace.getSpanContext(context);
    if (!spanContext || !isSpanContextValid(spanContext) || isTracingSuppressed(context)) {
      return;
    }

    // eslint-disable-next-line no-bitwise
    const samplingDecision = spanContext.traceFlags & TraceFlags.SAMPLED ? 1 : 0;
    const traceparent = `${spanContext.traceId}-${spanContext.spanId}-${samplingDecision}`;
    setter.set(carrier, SENTRY_TRACE_HEADER, traceparent);

    const span = SENTRY_SPAN_PROCESSOR_MAP.get(spanContext.spanId);
    if (span && span.transaction) {
      const dynamicSamplingContext = span.transaction.getDynamicSamplingContext();
      const sentryBaggageHeader = dynamicSamplingContextToSentryBaggageHeader(dynamicSamplingContext);
      if (sentryBaggageHeader) {
        setter.set(carrier, SENTRY_BAGGAGE_HEADER, sentryBaggageHeader);
      }
    }
  }

  /**
   * @inheritDoc
   */
  public extract(context: Context, carrier: unknown, getter: TextMapGetter): Context {
    let newContext = context;

    const maybeSentryTraceHeader: string | string[] | undefined = getter.get(carrier, SENTRY_TRACE_HEADER);
    if (maybeSentryTraceHeader) {
      const header = Array.isArray(maybeSentryTraceHeader) ? maybeSentryTraceHeader[0] : maybeSentryTraceHeader;
      const traceparentData = extractTraceparentData(header);
      newContext = newContext.setValue(SENTRY_TRACE_PARENT_CONTEXT_KEY, traceparentData);
      if (traceparentData) {
        const spanContext = {
          traceId: traceparentData.traceId || '',
          spanId: traceparentData.parentSpanId || '',
          isRemote: true,
          // Always sample if traceparent exists, we use SentrySpanProcessor to make sampling decisions with `startTransaction`.
          traceFlags: TraceFlags.SAMPLED,
        };
        newContext = trace.setSpanContext(newContext, spanContext);
      }
    }

    const maybeBaggageHeader = getter.get(carrier, SENTRY_BAGGAGE_HEADER);
    const dynamicSamplingContext = baggageHeaderToDynamicSamplingContext(maybeBaggageHeader);
    newContext = newContext.setValue(SENTRY_DYNAMIC_SAMPLING_CONTEXT_KEY, dynamicSamplingContext);

    return newContext;
  }

  /**
   * @inheritDoc
   */
  public fields(): string[] {
    return [SENTRY_TRACE_HEADER, SENTRY_BAGGAGE_HEADER];
  }
}
