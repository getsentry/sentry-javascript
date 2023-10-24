import type { Baggage, Context, SpanContext, TextMapGetter, TextMapSetter } from '@opentelemetry/api';
import { propagation, trace, TraceFlags } from '@opentelemetry/api';
import { isTracingSuppressed, W3CBaggagePropagator } from '@opentelemetry/core';
import { getDynamicSamplingContextFromClient } from '@sentry/core';
import type { DynamicSamplingContext, PropagationContext } from '@sentry/types';
import { generateSentryTraceHeader, SENTRY_BAGGAGE_KEY_PREFIX, tracingContextFromHeaders } from '@sentry/utils';

import { SENTRY_BAGGAGE_HEADER, SENTRY_TRACE_HEADER } from './constants';
import { getCurrentHub } from './custom/hub';
import { getPropagationContextFromContext, setPropagationContextOnContext } from './utils/contextData';
import { getSpanScope } from './utils/spanData';

/**
 * Injects and extracts `sentry-trace` and `baggage` headers from carriers.
 */
export class SentryPropagator extends W3CBaggagePropagator {
  /**
   * @inheritDoc
   */
  public inject(context: Context, carrier: unknown, setter: TextMapSetter): void {
    if (isTracingSuppressed(context)) {
      return;
    }

    let baggage = propagation.getBaggage(context) || propagation.createBaggage({});

    const propagationContext = getPropagationContextFromContext(context);
    const { spanId, traceId, sampled } = getSentryTraceData(context, propagationContext);
    const dynamicSamplingContext = propagationContext ? getDsc(context, propagationContext, traceId) : undefined;

    if (dynamicSamplingContext) {
      baggage = Object.entries(dynamicSamplingContext).reduce<Baggage>((b, [dscKey, dscValue]) => {
        if (dscValue) {
          return b.setEntry(`${SENTRY_BAGGAGE_KEY_PREFIX}${dscKey}`, { value: dscValue });
        }
        return b;
      }, baggage);
    }

    setter.set(carrier, SENTRY_TRACE_HEADER, generateSentryTraceHeader(traceId, spanId, sampled));

    super.inject(propagation.setBaggage(context, baggage), carrier, setter);
  }

  /**
   * @inheritDoc
   */
  public extract(context: Context, carrier: unknown, getter: TextMapGetter): Context {
    const maybeSentryTraceHeader: string | string[] | undefined = getter.get(carrier, SENTRY_TRACE_HEADER);
    const maybeBaggageHeader = getter.get(carrier, SENTRY_BAGGAGE_HEADER);

    const sentryTraceHeader = maybeSentryTraceHeader
      ? Array.isArray(maybeSentryTraceHeader)
        ? maybeSentryTraceHeader[0]
        : maybeSentryTraceHeader
      : undefined;

    const { propagationContext } = tracingContextFromHeaders(sentryTraceHeader, maybeBaggageHeader);

    // Add propagation context to context
    const contextWithPropagationContext = setPropagationContextOnContext(context, propagationContext);

    const spanContext: SpanContext = {
      traceId: propagationContext.traceId,
      spanId: propagationContext.parentSpanId || '',
      isRemote: true,
      traceFlags: propagationContext.sampled === true ? TraceFlags.SAMPLED : TraceFlags.NONE,
    };

    // Add remote parent span context
    return trace.setSpanContext(contextWithPropagationContext, spanContext);
  }

  /**
   * @inheritDoc
   */
  public fields(): string[] {
    return [SENTRY_TRACE_HEADER, SENTRY_BAGGAGE_HEADER];
  }
}

function getDsc(
  context: Context,
  propagationContext: PropagationContext,
  traceId: string | undefined,
): DynamicSamplingContext | undefined {
  // If we have a DSC on the propagation context, we just use it
  if (propagationContext.dsc) {
    return propagationContext.dsc;
  }

  // Else, we try to generate a new one
  const client = getCurrentHub().getClient();
  const activeSpan = trace.getSpan(context);
  const scope = activeSpan ? getSpanScope(activeSpan) : undefined;

  if (client) {
    return getDynamicSamplingContextFromClient(traceId || propagationContext.traceId, client, scope);
  }

  return undefined;
}

function getSentryTraceData(
  context: Context,
  propagationContext: PropagationContext | undefined,
): {
  spanId: string | undefined;
  traceId: string | undefined;
  sampled: boolean | undefined;
} {
  const span = trace.getSpan(context);
  const spanContext = span && span.spanContext();

  const traceId = spanContext ? spanContext.traceId : propagationContext?.traceId;

  // We have a few scenarios here:
  // If we have an active span, and it is _not_ remote, we just use the span's ID
  // If we have an active span that is remote, we do not want to use the spanId, as we don't want to attach it to the parent span
  // If `isRemote === true`, the span is bascially virtual
  // If we don't have a local active span, we use the generated spanId from the propagationContext
  const spanId = spanContext && !spanContext.isRemote ? spanContext.spanId : propagationContext?.spanId;

  // eslint-disable-next-line no-bitwise
  const sampled = spanContext ? Boolean(spanContext.traceFlags & TraceFlags.SAMPLED) : propagationContext?.sampled;

  return { traceId, spanId, sampled };
}
