import type { Baggage, Context, SpanContext, TextMapGetter, TextMapSetter } from '@opentelemetry/api';
import { TraceFlags, propagation, trace } from '@opentelemetry/api';
import { TraceState, W3CBaggagePropagator, isTracingSuppressed } from '@opentelemetry/core';
import { getClient, getCurrentScope, getDynamicSamplingContextFromClient, getIsolationScope } from '@sentry/core';
import type { DynamicSamplingContext, PropagationContext } from '@sentry/types';
import {
  SENTRY_BAGGAGE_KEY_PREFIX,
  baggageHeaderToDynamicSamplingContext,
  dynamicSamplingContextToSentryBaggageHeader,
  generateSentryTraceHeader,
  propagationContextFromHeaders,
} from '@sentry/utils';

import {
  SENTRY_BAGGAGE_HEADER,
  SENTRY_TRACE_HEADER,
  SENTRY_TRACE_STATE_DSC,
  SENTRY_TRACE_STATE_PARENT_SPAN_ID,
} from './constants';
import { getScopesFromContext, setScopesOnContext } from './utils/contextData';

/** Get the Sentry propagation context from a span context. */
export function getPropagationContextFromSpanContext(spanContext: SpanContext): PropagationContext {
  const { traceId, spanId, traceFlags, traceState } = spanContext;

  const dscString = traceState ? traceState.get(SENTRY_TRACE_STATE_DSC) : undefined;
  const dsc = dscString ? baggageHeaderToDynamicSamplingContext(dscString) : undefined;
  const parentSpanId = traceState ? traceState.get(SENTRY_TRACE_STATE_PARENT_SPAN_ID) : undefined;
  const sampled = traceFlags === TraceFlags.SAMPLED;

  return {
    traceId,
    spanId,
    sampled,
    parentSpanId,
    dsc,
  };
}

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

    const { dynamicSamplingContext, traceId, spanId, sampled } = getInjectionData(context);

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

    const propagationContext = propagationContextFromHeaders(sentryTraceHeader, maybeBaggageHeader);

    // We store the DSC as OTEL trace state on the span context
    const traceState = makeTraceState({
      parentSpanId: propagationContext.parentSpanId,
      dsc: propagationContext.dsc,
    });

    const spanContext: SpanContext = {
      traceId: propagationContext.traceId,
      spanId: propagationContext.parentSpanId || '',
      isRemote: true,
      traceFlags: propagationContext.sampled === true ? TraceFlags.SAMPLED : TraceFlags.NONE,
      traceState,
    };

    // Add remote parent span context,
    const ctxWithSpanContext = trace.setSpanContext(context, spanContext);

    // Also update the scope on the context (to be sure this is picked up everywhere)
    const scopes = getScopesFromContext(ctxWithSpanContext);
    const newScopes = {
      scope: scopes ? scopes.scope.clone() : getCurrentScope().clone(),
      isolationScope: scopes ? scopes.isolationScope : getIsolationScope(),
    };
    newScopes.scope.setPropagationContext(propagationContext);

    return setScopesOnContext(ctxWithSpanContext, newScopes);
  }

  /**
   * @inheritDoc
   */
  public fields(): string[] {
    return [SENTRY_TRACE_HEADER, SENTRY_BAGGAGE_HEADER];
  }
}

/** Exported for tests. */
export function makeTraceState({
  parentSpanId,
  dsc,
}: { parentSpanId?: string; dsc?: Partial<DynamicSamplingContext> }): TraceState | undefined {
  if (!parentSpanId && !dsc) {
    return undefined;
  }

  // We store the DSC as OTEL trace state on the span context
  const dscString = dsc ? dynamicSamplingContextToSentryBaggageHeader(dsc) : undefined;

  const traceStateBase = parentSpanId
    ? new TraceState().set(SENTRY_TRACE_STATE_PARENT_SPAN_ID, parentSpanId)
    : new TraceState();

  return dscString ? traceStateBase.set(SENTRY_TRACE_STATE_DSC, dscString) : traceStateBase;
}

function getInjectionData(context: Context): {
  dynamicSamplingContext: Partial<DynamicSamplingContext> | undefined;
  traceId: string | undefined;
  spanId: string | undefined;
  sampled: boolean | undefined;
} {
  const span = trace.getSpan(context);
  const spanIsRemote = span?.spanContext().isRemote;

  // If we have a local span, we can just pick everything from it
  if (span && !spanIsRemote) {
    const spanContext = span.spanContext();
    const propagationContext = getPropagationContextFromSpanContext(spanContext);
    const dynamicSamplingContext = getDynamicSamplingContext(propagationContext, spanContext.traceId);
    return {
      dynamicSamplingContext,
      traceId: spanContext.traceId,
      spanId: spanContext.spanId,
      sampled: spanContext.traceFlags === TraceFlags.SAMPLED,
    };
  }

  // Else we try to use the propagation context from the scope
  const scope = getScopesFromContext(context)?.scope;
  if (scope) {
    const propagationContext = scope.getPropagationContext();
    const dynamicSamplingContext = getDynamicSamplingContext(propagationContext, propagationContext.traceId);
    return {
      dynamicSamplingContext,
      traceId: propagationContext.traceId,
      spanId: propagationContext.spanId,
      sampled: propagationContext.sampled,
    };
  }

  // Else, we look at the remote span context
  const spanContext = trace.getSpanContext(context);
  if (spanContext) {
    const propagationContext = getPropagationContextFromSpanContext(spanContext);
    const dynamicSamplingContext = getDynamicSamplingContext(propagationContext, spanContext.traceId);

    return {
      dynamicSamplingContext,
      traceId: spanContext.traceId,
      spanId: spanContext.spanId,
      sampled: spanContext.traceFlags === TraceFlags.SAMPLED,
    };
  }

  // If we have neither, there is nothing much we can do, but that should not happen usually
  // Unless there is a detached OTEL context being passed around
  return {
    dynamicSamplingContext: undefined,
    traceId: undefined,
    spanId: undefined,
    sampled: undefined,
  };
}

/** Get the DSC from a context, or fall back to use the one from the client. */
function getDynamicSamplingContext(
  propagationContext: PropagationContext,
  traceId: string | undefined,
): Partial<DynamicSamplingContext> | undefined {
  // If we have a DSC on the propagation context, we just use it
  if (propagationContext?.dsc) {
    return propagationContext.dsc;
  }

  // Else, we try to generate a new one
  const client = getClient();

  if (client) {
    return getDynamicSamplingContextFromClient(traceId || propagationContext.traceId, client);
  }

  return undefined;
}
