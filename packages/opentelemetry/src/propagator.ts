import type { Baggage, Context, Span, SpanContext, TextMapGetter, TextMapSetter } from '@opentelemetry/api';
import { context } from '@opentelemetry/api';
import { TraceFlags, propagation, trace } from '@opentelemetry/api';
import { TraceState, W3CBaggagePropagator, isTracingSuppressed } from '@opentelemetry/core';
import { SEMATTRS_HTTP_URL } from '@opentelemetry/semantic-conventions';
import type { continueTrace } from '@sentry/core';
import { hasTracingEnabled } from '@sentry/core';
import { getRootSpan } from '@sentry/core';
import { spanToJSON } from '@sentry/core';
import { getClient, getCurrentScope, getDynamicSamplingContextFromClient, getIsolationScope } from '@sentry/core';
import type { DynamicSamplingContext, Options, PropagationContext } from '@sentry/types';
import {
  LRUMap,
  SENTRY_BAGGAGE_KEY_PREFIX,
  baggageHeaderToDynamicSamplingContext,
  dynamicSamplingContextToSentryBaggageHeader,
  generateSentryTraceHeader,
  logger,
  parseBaggageHeader,
  propagationContextFromHeaders,
  stringMatchesSomePattern,
} from '@sentry/utils';

import {
  SENTRY_BAGGAGE_HEADER,
  SENTRY_TRACE_HEADER,
  SENTRY_TRACE_STATE_DSC,
  SENTRY_TRACE_STATE_PARENT_SPAN_ID,
  SENTRY_TRACE_STATE_SAMPLED_NOT_RECORDING,
  SENTRY_TRACE_STATE_URL,
} from './constants';
import { DEBUG_BUILD } from './debug-build';
import { getScopesFromContext, setScopesOnContext } from './utils/contextData';
import { getDynamicSamplingContextFromSpan } from './utils/dynamicSamplingContext';
import { getSamplingDecision } from './utils/getSamplingDecision';
import { setIsSetup } from './utils/setupCheck';

/** Get the Sentry propagation context from a span context. */
export function getPropagationContextFromSpan(span: Span): PropagationContext {
  const spanContext = span.spanContext();
  const { traceId, spanId, traceState } = spanContext;

  // When we have a dsc trace state, it means this came from the incoming trace
  // Then this takes presedence over the root span
  const dscString = traceState ? traceState.get(SENTRY_TRACE_STATE_DSC) : undefined;
  const traceStateDsc = dscString ? baggageHeaderToDynamicSamplingContext(dscString) : undefined;

  const parentSpanId = traceState ? traceState.get(SENTRY_TRACE_STATE_PARENT_SPAN_ID) : undefined;

  const sampled = getSamplingDecision(spanContext);

  // No trace state? --> Take DSC from root span
  const dsc = traceStateDsc || getDynamicSamplingContextFromSpan(getRootSpan(span));

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
  /** A map of URLs that have already been checked for if they match tracePropagationTargets. */
  private _urlMatchesTargetsMap: LRUMap<string, boolean>;

  public constructor() {
    super();
    setIsSetup('SentryPropagator');

    // We're caching results so we don't have to recompute regexp every time we create a request.
    this._urlMatchesTargetsMap = new LRUMap<string, boolean>(100);
  }

  /**
   * @inheritDoc
   */
  public inject(context: Context, carrier: unknown, setter: TextMapSetter): void {
    if (isTracingSuppressed(context)) {
      DEBUG_BUILD && logger.log('[Tracing] Not injecting trace data for url because tracing is suppressed.');
      return;
    }

    const activeSpan = trace.getSpan(context);
    const url = activeSpan && getCurrentURL(activeSpan);

    const tracePropagationTargets = getClient()?.getOptions()?.tracePropagationTargets;
    if (
      typeof url === 'string' &&
      tracePropagationTargets &&
      !this._shouldInjectTraceData(tracePropagationTargets, url)
    ) {
      DEBUG_BUILD &&
        logger.log(
          '[Tracing] Not injecting trace data for url because it does not match tracePropagationTargets:',
          url,
        );
      return;
    }

    const existingBaggageHeader = getExistingBaggage(carrier);
    let baggage = propagation.getBaggage(context) || propagation.createBaggage({});

    const { dynamicSamplingContext, traceId, spanId, sampled } = getInjectionData(context);

    if (existingBaggageHeader) {
      const baggageEntries = parseBaggageHeader(existingBaggageHeader);

      if (baggageEntries) {
        Object.entries(baggageEntries).forEach(([key, value]) => {
          baggage = baggage.setEntry(key, { value });
        });
      }
    }

    if (dynamicSamplingContext) {
      baggage = Object.entries(dynamicSamplingContext).reduce<Baggage>((b, [dscKey, dscValue]) => {
        if (dscValue) {
          return b.setEntry(`${SENTRY_BAGGAGE_KEY_PREFIX}${dscKey}`, { value: dscValue });
        }
        return b;
      }, baggage);
    }

    // We also want to avoid setting the default OTEL trace ID, if we get that for whatever reason
    if (traceId && traceId !== '00000000000000000000000000000000') {
      setter.set(carrier, SENTRY_TRACE_HEADER, generateSentryTraceHeader(traceId, spanId, sampled));
    }

    super.inject(propagation.setBaggage(context, baggage), carrier, setter);
  }

  /**
   * @inheritDoc
   */
  public extract(context: Context, carrier: unknown, getter: TextMapGetter): Context {
    const maybeSentryTraceHeader: string | string[] | undefined = getter.get(carrier, SENTRY_TRACE_HEADER);
    const baggage = getter.get(carrier, SENTRY_BAGGAGE_HEADER);

    const sentryTrace = maybeSentryTraceHeader
      ? Array.isArray(maybeSentryTraceHeader)
        ? maybeSentryTraceHeader[0]
        : maybeSentryTraceHeader
      : undefined;

    const propagationContext = propagationContextFromHeaders(sentryTrace, baggage);

    // Add remote parent span context,
    const ctxWithSpanContext = getContextWithRemoteActiveSpan(context, { sentryTrace, baggage });

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

  /** If we want to inject trace data for a given URL. */
  private _shouldInjectTraceData(tracePropagationTargets: Options['tracePropagationTargets'], url: string): boolean {
    if (tracePropagationTargets === undefined) {
      return true;
    }

    const cachedDecision = this._urlMatchesTargetsMap.get(url);
    if (cachedDecision !== undefined) {
      return cachedDecision;
    }

    const decision = stringMatchesSomePattern(url, tracePropagationTargets);
    this._urlMatchesTargetsMap.set(url, decision);
    return decision;
  }
}

/** Exported for tests. */
export function makeTraceState({
  parentSpanId,
  dsc,
  sampled,
}: {
  parentSpanId?: string;
  dsc?: Partial<DynamicSamplingContext>;
  sampled?: boolean;
}): TraceState | undefined {
  if (!parentSpanId && !dsc && sampled !== false) {
    return undefined;
  }

  // We store the DSC as OTEL trace state on the span context
  const dscString = dsc ? dynamicSamplingContextToSentryBaggageHeader(dsc) : undefined;

  const traceStateBase = parentSpanId
    ? new TraceState().set(SENTRY_TRACE_STATE_PARENT_SPAN_ID, parentSpanId)
    : new TraceState();

  const traceStateWithDsc = dscString ? traceStateBase.set(SENTRY_TRACE_STATE_DSC, dscString) : traceStateBase;

  // We also specifically want to store if this is sampled to be not recording,
  // or unsampled (=could be either sampled or not)
  return sampled === false ? traceStateWithDsc.set(SENTRY_TRACE_STATE_SAMPLED_NOT_RECORDING, '1') : traceStateWithDsc;
}

function getInjectionData(context: Context): {
  dynamicSamplingContext: Partial<DynamicSamplingContext> | undefined;
  traceId: string | undefined;
  spanId: string | undefined;
  sampled: boolean | undefined;
} {
  const span = hasTracingEnabled() ? trace.getSpan(context) : undefined;
  const spanIsRemote = span?.spanContext().isRemote;

  // If we have a local span, we can just pick everything from it
  if (span && !spanIsRemote) {
    const spanContext = span.spanContext();

    const propagationContext = getPropagationContextFromSpan(span);
    const dynamicSamplingContext = getDynamicSamplingContext(propagationContext, spanContext.traceId);
    return {
      dynamicSamplingContext,
      traceId: spanContext.traceId,
      spanId: spanContext.spanId,
      sampled: getSamplingDecision(spanContext),
    };
  }

  // Else we try to use the propagation context from the scope
  const scope = getScopesFromContext(context)?.scope || getCurrentScope();

  const propagationContext = scope.getPropagationContext();
  const dynamicSamplingContext = getDynamicSamplingContext(propagationContext, propagationContext.traceId);
  return {
    dynamicSamplingContext,
    traceId: propagationContext.traceId,
    spanId: propagationContext.spanId,
    sampled: propagationContext.sampled,
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

function getContextWithRemoteActiveSpan(
  ctx: Context,
  { sentryTrace, baggage }: Parameters<typeof continueTrace>[0],
): Context {
  const propagationContext = propagationContextFromHeaders(sentryTrace, baggage);

  // We store the DSC as OTEL trace state on the span context
  const traceState = makeTraceState({
    parentSpanId: propagationContext.parentSpanId,
    dsc: propagationContext.dsc,
    sampled: propagationContext.sampled,
  });

  const spanContext: SpanContext = {
    traceId: propagationContext.traceId,
    spanId: propagationContext.parentSpanId || '',
    isRemote: true,
    traceFlags: propagationContext.sampled ? TraceFlags.SAMPLED : TraceFlags.NONE,
    traceState,
  };

  return trace.setSpanContext(ctx, spanContext);
}

/**
 * Takes trace strings and propagates them as a remote active span.
 * This should be used in addition to `continueTrace` in OTEL-powered environments.
 */
export function continueTraceAsRemoteSpan<T>(
  ctx: Context,
  options: Parameters<typeof continueTrace>[0],
  callback: () => T,
): T {
  const ctxWithSpanContext = getContextWithRemoteActiveSpan(ctx, options);

  return context.with(ctxWithSpanContext, callback);
}

/** Try to get the existing baggage header so we can merge this in. */
function getExistingBaggage(carrier: unknown): string | undefined {
  try {
    const baggage = (carrier as Record<string, string | string[]>)[SENTRY_BAGGAGE_HEADER];
    return Array.isArray(baggage) ? baggage.join(',') : baggage;
  } catch {
    return undefined;
  }
}

/**
 * It is pretty tricky to get access to the outgoing request URL of a request in the propagator.
 * As we only have access to the context of the span to be sent and the carrier (=headers),
 * but the span may be unsampled and thus have no attributes.
 *
 * So we use the following logic:
 * 1. If we have an active span, we check if it has a URL attribute.
 * 2. Else, if the active span has no URL attribute (e.g. it is unsampled), we check a special trace state (which we set in our sampler).
 */
function getCurrentURL(span: Span): string | undefined {
  const urlAttribute = spanToJSON(span).data?.[SEMATTRS_HTTP_URL];
  if (urlAttribute) {
    return urlAttribute;
  }

  // Also look at the traceState, which we may set in the sampler even for unsampled spans
  const urlTraceState = span.spanContext().traceState?.get(SENTRY_TRACE_STATE_URL);
  if (urlTraceState) {
    return urlTraceState;
  }

  return undefined;
}
