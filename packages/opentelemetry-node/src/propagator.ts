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
import { dynamicSamplingContextToSentryBaggageHeader } from '@sentry/utils';

import { SENTRY_BAGGAGE_HEADER, SENTRY_TRACE_HEADER } from './constants';
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
  public extract(context: Context, _carrier: unknown, _getter: TextMapGetter): Context {
    return context;
  }

  /**
   * @inheritDoc
   */
  public fields(): string[] {
    return [SENTRY_TRACE_HEADER, SENTRY_BAGGAGE_HEADER];
  }
}
