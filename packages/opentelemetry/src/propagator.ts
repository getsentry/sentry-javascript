import type { Baggage, Context, Span, SpanContext, TextMapGetter, TextMapSetter } from '@opentelemetry/api';
import { TraceFlags } from '@opentelemetry/api';
import { INVALID_TRACEID } from '@opentelemetry/api';
import { context } from '@opentelemetry/api';
import { propagation, trace } from '@opentelemetry/api';
import { W3CBaggagePropagator, isTracingSuppressed } from '@opentelemetry/core';
import { ATTR_URL_FULL, SEMATTRS_HTTP_URL } from '@opentelemetry/semantic-conventions';
import type { continueTrace } from '@sentry/core';
import { getDynamicSamplingContextFromScope } from '@sentry/core';
import { getRootSpan } from '@sentry/core';
import { spanToJSON } from '@sentry/core';
import { getClient, getCurrentScope, getDynamicSamplingContextFromSpan, getIsolationScope } from '@sentry/core';
import {
  LRUMap,
  SENTRY_BAGGAGE_KEY_PREFIX,
  baggageHeaderToDynamicSamplingContext,
  generateSentryTraceHeader,
  logger,
  parseBaggageHeader,
  propagationContextFromHeaders,
  stringMatchesSomePattern,
} from '@sentry/core';
import type { DynamicSamplingContext, Options, PropagationContext } from '@sentry/types';

import {
  SENTRY_BAGGAGE_HEADER,
  SENTRY_TRACE_HEADER,
  SENTRY_TRACE_STATE_DSC,
  SENTRY_TRACE_STATE_PARENT_SPAN_ID,
  SENTRY_TRACE_STATE_URL,
} from './constants';
import { DEBUG_BUILD } from './debug-build';
import { getScopesFromContext, setScopesOnContext } from './utils/contextData';
import { getSamplingDecision } from './utils/getSamplingDecision';
import { makeTraceState } from './utils/makeTraceState';
import { setIsSetup } from './utils/setupCheck';

/** Get the Sentry propagation context from a span context. */
export function getPropagationContextFromSpan(span: Span): PropagationContext {
  const spanContext = span.spanContext();
  const { traceId, spanId, traceState } = spanContext;

  // When we have a dsc trace state, it means this came from the incoming trace
  // Then this takes presedence over the root span
  const dscString = traceState ? traceState.get(SENTRY_TRACE_STATE_DSC) : undefined;
  const traceStateDsc = dscString ? baggageHeaderToDynamicSamplingContext(dscString) : undefined;

  const parentSpanId = traceState ? traceState.get(SENTRY_TRACE_STATE_PARENT_SPAN_ID) || undefined : undefined;

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
    if (!shouldPropagateTraceForUrl(url, tracePropagationTargets, this._urlMatchesTargetsMap)) {
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
    if (traceId && traceId !== INVALID_TRACEID) {
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

    // Add remote parent span context
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
}

const NOT_PROPAGATED_MESSAGE =
  '[Tracing] Not injecting trace data for url because it does not match tracePropagationTargets:';

/**
 * Check if a given URL should be propagated to or not.
 * If no url is defined, or no trace propagation targets are defined, this will always return `true`.
 * You can also optionally provide a decision map, to cache decisions and avoid repeated regex lookups.
 */
export function shouldPropagateTraceForUrl(
  url: string | undefined,
  tracePropagationTargets: Options['tracePropagationTargets'],
  decisionMap?: LRUMap<string, boolean>,
): boolean {
  if (typeof url !== 'string' || !tracePropagationTargets) {
    return true;
  }

  const cachedDecision = decisionMap?.get(url);
  if (cachedDecision !== undefined) {
    DEBUG_BUILD && !cachedDecision && logger.log(NOT_PROPAGATED_MESSAGE, url);
    return cachedDecision;
  }

  const decision = stringMatchesSomePattern(url, tracePropagationTargets);
  decisionMap?.set(url, decision);

  DEBUG_BUILD && !decision && logger.log(NOT_PROPAGATED_MESSAGE, url);
  return decision;
}

/**
 * Get propagation injection data for the given context.
 */
export function getInjectionData(context: Context): {
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

    const dynamicSamplingContext = getDynamicSamplingContextFromSpan(span);
    return {
      dynamicSamplingContext,
      traceId: spanContext.traceId,
      spanId: spanContext.spanId,
      sampled: getSamplingDecision(spanContext),
    };
  }

  // Else we try to use the propagation context from the scope
  const scope = getScopesFromContext(context)?.scope || getCurrentScope();
  const client = getClient();

  const propagationContext = scope.getPropagationContext();
  const dynamicSamplingContext = client ? getDynamicSamplingContextFromScope(client, scope) : undefined;
  return {
    dynamicSamplingContext,
    traceId: propagationContext.traceId,
    // TODO(v9): Use generateSpanId() instead
    // eslint-disable-next-line deprecation/deprecation
    spanId: propagationContext.spanId,
    sampled: propagationContext.sampled,
  };
}

function getContextWithRemoteActiveSpan(
  ctx: Context,
  { sentryTrace, baggage }: Parameters<typeof continueTrace>[0],
): Context {
  const propagationContext = propagationContextFromHeaders(sentryTrace, baggage);

  const spanContext = generateSpanContextForPropagationContext(propagationContext);
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
  const spanData = spanToJSON(span).data;
  // `ATTR_URL_FULL` is the new attribute, but we still support the old one, `SEMATTRS_HTTP_URL`, for now.
  // eslint-disable-next-line deprecation/deprecation
  const urlAttribute = spanData?.[SEMATTRS_HTTP_URL] || spanData?.[ATTR_URL_FULL];
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

// TODO: Adjust this behavior to avoid invalid spans
function generateSpanContextForPropagationContext(propagationContext: PropagationContext): SpanContext {
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

  return spanContext;
}
