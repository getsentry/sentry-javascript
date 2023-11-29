import type { Baggage, Context, TextMapGetter, TextMapSetter } from '@opentelemetry/api';
import { TraceFlags, isSpanContextValid, propagation, trace } from '@opentelemetry/api';
import { W3CBaggagePropagator, isTracingSuppressed } from '@opentelemetry/core';
import {
  SENTRY_BAGGAGE_KEY_PREFIX,
  baggageHeaderToDynamicSamplingContext,
  extractTraceparentData,
} from '@sentry/utils';

import {
  SENTRY_BAGGAGE_HEADER,
  SENTRY_DYNAMIC_SAMPLING_CONTEXT_KEY,
  SENTRY_TRACE_HEADER,
  SENTRY_TRACE_PARENT_CONTEXT_KEY,
} from './constants';
import { getSentrySpan } from './utils/spanMap';

/**
 * Injects and extracts `sentry-trace` and `baggage` headers from carriers.
 */
export class SentryPropagator extends W3CBaggagePropagator {
  /**
   * @inheritDoc
   */
  public inject(context: Context, carrier: unknown, setter: TextMapSetter): void {
    const spanContext = trace.getSpanContext(context);
    if (!spanContext || !isSpanContextValid(spanContext) || isTracingSuppressed(context)) {
      return;
    }

    let baggage = propagation.getBaggage(context) || propagation.createBaggage({});

    const span = getSentrySpan(spanContext.spanId);
    if (span) {
      setter.set(carrier, SENTRY_TRACE_HEADER, span.toTraceparent());

      if (span.transaction) {
        const dynamicSamplingContext = span.transaction.getDynamicSamplingContext();
        baggage = Object.entries(dynamicSamplingContext).reduce<Baggage>((b, [dscKey, dscValue]) => {
          if (dscValue) {
            return b.setEntry(`${SENTRY_BAGGAGE_KEY_PREFIX}${dscKey}`, { value: dscValue });
          }
          return b;
        }, baggage);
      }
    }
    super.inject(propagation.setBaggage(context, baggage), carrier, setter);
  }

  /**
   * @inheritDoc
   */
  public extract(context: Context, carrier: unknown, getter: TextMapGetter): Context {
    let newContext = context;

    const maybeSentryTraceHeader: string | string[] | undefined = getter.get(carrier, SENTRY_TRACE_HEADER);
    if (maybeSentryTraceHeader) {
      const header = Array.isArray(maybeSentryTraceHeader) ? maybeSentryTraceHeader[0] : maybeSentryTraceHeader;
      const traceparentData = extractTraceparentData(header || '');
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
