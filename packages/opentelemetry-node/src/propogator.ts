import {
  Context as OpenTelemetryContext,
  isSpanContextValid,
  TextMapGetter,
  TextMapPropagator,
  TextMapSetter,
  trace,
  TraceFlags,
} from '@opentelemetry/api';
import { isTracingSuppressed } from '@opentelemetry/core';
import { Transaction } from '@sentry/types';
import {
  baggageHeaderToDynamicSamplingContext,
  dynamicSamplingContextToSentryBaggageHeader,
  extractTraceparentData,
} from '@sentry/utils';

import {
  SENTRY_BAGGAGE_HEADER,
  SENTRY_CURRENT_TRANSACTION_CONTEXT_KEY,
  SENTRY_DYNAMIC_SAMPLING_CONTEXT_KEY,
  SENTRY_TRACE_HEADER,
  SENTRY_TRACE_PARENT_CONTEXT_KEY,
} from './constants';

/**
 * Injects and extracts `sentry-trace` and `baggage` headers from carriers.
 */
export class SentryPropogator implements TextMapPropagator {
  /**
   * @inheritDoc
   */
  public inject(context: OpenTelemetryContext, carrier: unknown, setter: TextMapSetter): void {
    const spanContext = trace.getSpanContext(context);
    if (!spanContext || !isSpanContextValid(spanContext) || isTracingSuppressed(context)) {
      return;
    }

    // TODO: if sentry span use `parentSpanId`.
    // Same `isSentryRequest` as is used in `SentrySpanProcessor`.
    // const spanId = isSentryRequest(spanContext) ? spanContext.parentSpanId : spanContext.spanId;

    const traceparent = `${spanContext.traceId}-${spanContext.spanId}-0${
      // eslint-disable-next-line no-bitwise
      spanContext.traceFlags & TraceFlags.SAMPLED ? 1 : 0
    }`;
    setter.set(carrier, SENTRY_TRACE_HEADER, traceparent);

    const transaction = context.getValue(SENTRY_CURRENT_TRANSACTION_CONTEXT_KEY) as Transaction | undefined;
    if (transaction) {
      const dynamicSamplingContext = transaction.getDynamicSamplingContext();
      const sentryBaggageHeader = dynamicSamplingContextToSentryBaggageHeader(dynamicSamplingContext);
      if (sentryBaggageHeader) {
        setter.set(carrier, SENTRY_BAGGAGE_HEADER, sentryBaggageHeader);
      }
    }
  }

  /**
   * @inheritDoc
   */
  public extract(context: OpenTelemetryContext, carrier: unknown, getter: TextMapGetter): OpenTelemetryContext {
    let newContext = context;

    const maybeSentryTraceHeader: string | string[] | undefined = getter.get(carrier, SENTRY_TRACE_HEADER);
    if (maybeSentryTraceHeader) {
      const header = maybeSentryTraceHeader ? maybeSentryTraceHeader[0] : maybeSentryTraceHeader;
      const traceparentData = extractTraceparentData(header);
      newContext.setValue(SENTRY_TRACE_PARENT_CONTEXT_KEY, traceparentData);
      if (traceparentData) {
        const traceFlags = traceparentData.parentSampled ? TraceFlags.SAMPLED : TraceFlags.NONE;
        const spanContext = {
          traceId: traceparentData.traceId || '',
          spanId: traceparentData.parentSpanId || '',
          isRemote: true,
          traceFlags,
        };
        newContext = trace.setSpanContext(context, spanContext);
      }
    }

    const maybeBaggageHeader = getter.get(carrier, BAGGAGE_HEADER);
    const dynamicSamplingContext = baggageHeaderToDynamicSamplingContext(maybeBaggageHeader);
    newContext.setValue(SENTRY_DYNAMIC_SAMPLING_CONTEXT_KEY, dynamicSamplingContext);

    return newContext;
  }

  /**
   * @inheritDoc
   */
  public fields(): string[] {
    return [SENTRY_TRACE_HEADER, BAGGAGE_HEADER];
  }
}
