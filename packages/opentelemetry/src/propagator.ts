import type { Context, SpanContext, TextMapGetter, TextMapPropagator, TextMapSetter } from '@opentelemetry/api';
import { context, trace, TraceFlags } from '@opentelemetry/api';
import type { continueTrace, DynamicSamplingContext } from '@sentry/core';
import {
  _INTERNAL_safeMathRandom,
  baggageHeaderToDynamicSamplingContext,
  consoleSandbox,
  generateTraceId,
  getClient,
  getCurrentScope,
  getIsolationScope,
  getTraceData,
  isTracingSuppressed,
  propagationContextFromHeaders,
  shouldContinueTrace,
} from '@sentry/core';
import { getScopesFromContext, setScopesOnContext } from './utils/contextData';
import { makeTraceState } from './utils/makeTraceState';

const SENTRY_TRACE_HEADER = 'sentry-trace';
const SENTRY_BAGGAGE_HEADER = 'baggage';
const W3C_TRACEPARENT_HEADER = 'traceparent';

/**
 * A minimal OpenTelemetry `TextMapPropagator` that injects and extracts Sentry trace data.
 *
 * This propagator only supports injecting/extracting from current context, for simplicity sake.
 * It will bail and do nothing if using a different context.
 */
export class SentryPropagator implements TextMapPropagator {
  /** @inheritDoc */
  public inject(ctx: Context, carrier: unknown, setter: TextMapSetter): void {
    if (ctx !== context.active()) {
      consoleSandbox(() => {
        // oxlint-disable-next-line no-console
        console.warn(
          'SentryPropagator: Injecting trace data of a different context than the active one is not supported. Skipping injection.',
        );
      });
      return;
    }

    if (isTracingSuppressed()) {
      return;
    }

    const { propagateTraceparent } = getClient()?.getOptions() ?? {};

    // Pick trace data from the current scope
    const { 'sentry-trace': sentryTrace, baggage, traceparent } = getTraceData({ propagateTraceparent });

    if (sentryTrace) {
      setter.set(carrier, SENTRY_TRACE_HEADER, sentryTrace);
    }
    if (baggage) {
      setter.set(carrier, SENTRY_BAGGAGE_HEADER, baggage);
    }
    if (traceparent) {
      setter.set(carrier, W3C_TRACEPARENT_HEADER, traceparent);
    }
  }

  /** @inheritDoc */
  public extract(ctx: Context, carrier: unknown, getter: TextMapGetter): Context {
    const maybeSentryTraceHeader: string | string[] | undefined = getter.get(carrier, SENTRY_TRACE_HEADER);
    const baggage = getter.get(carrier, SENTRY_BAGGAGE_HEADER);

    const sentryTrace = Array.isArray(maybeSentryTraceHeader) ? maybeSentryTraceHeader[0] : maybeSentryTraceHeader;

    // Add remote parent span context. If there is no incoming trace, this returns the context as-is.
    return getContextWithRemoteActiveSpanAndScopes(ctx, { sentryTrace, baggage });
  }

  /** @inheritDoc */
  public fields(): string[] {
    return [SENTRY_TRACE_HEADER, SENTRY_BAGGAGE_HEADER, W3C_TRACEPARENT_HEADER];
  }
}

function getContextWithRemoteActiveSpan(
  ctx: Context,
  { sentryTrace, baggage }: Parameters<typeof continueTrace>[0],
): Context {
  const propagationContext = propagationContextFromHeaders(sentryTrace, baggage);

  const { traceId, parentSpanId, sampled, dsc } = propagationContext;

  const client = getClient();
  const incomingDsc = baggageHeaderToDynamicSamplingContext(baggage);

  // We only want to set the virtual span if we are continuing a concrete trace
  // Otherwise, we ignore the incoming trace here, e.g. if we have no trace headers
  if (!parentSpanId || (client && !shouldContinueTrace(client, incomingDsc?.org_id))) {
    return ctx;
  }

  const spanContext = generateRemoteSpanContext({
    traceId,
    spanId: parentSpanId,
    sampled,
    dsc,
  });

  return trace.setSpanContext(ctx, spanContext);
}

/**
 * Build a context that continues an incoming trace as a remote active span, with scopes ensured.
 * Returns the context so it can be used to implement an OpenTelemetry propagator's `extract`.
 */
function getContextWithRemoteActiveSpanAndScopes(ctx: Context, options: Parameters<typeof continueTrace>[0]): Context {
  const ctxWithRemoteSpan = getContextWithRemoteActiveSpan(ctx, options);
  // If a remote active span was set, we are continuing an incoming trace, so the trace id is fixed.
  // Otherwise there was no (valid) incoming trace and we are the head of a new trace.
  const isContinuingTrace = trace.getSpanContext(ctxWithRemoteSpan) !== undefined;
  return ensureScopesOnContext(ctxWithRemoteSpan, isContinuingTrace);
}

function ensureScopesOnContext(ctx: Context, isContinuingTrace: boolean): Context {
  // If there are no scopes yet on the context, ensure we have them
  const scopes = getScopesFromContext(ctx);

  // If we have no scope here, this is most likely either the root context or a context manually derived from it
  // In this case, we want to fork the current scope, to ensure we do not pollute the root scope
  const scope = scopes ? scopes.scope : getCurrentScope().clone();

  // When we forked a fresh scope and are not continuing an incoming trace, we give it its own trace.
  // Without this, concurrent header-less requests (e.g. edge middleware, whose root span is created by
  // upstream OTEL instrumentation rather than through `continueTrace`) would all inherit the forked
  // scope's trace id and collapse into a single trace. Mirrors `continueTrace` in the core HTTP server.
  if (!scopes && !isContinuingTrace) {
    const propagationContext = scope.getPropagationContext();
    scope.setPropagationContext({
      ...propagationContext,
      traceId: generateTraceId(),
      sampleRand: _INTERNAL_safeMathRandom(),
    });
  }

  const newScopes = {
    scope,
    isolationScope: scopes ? scopes.isolationScope : getIsolationScope(),
  };

  return setScopesOnContext(ctx, newScopes);
}

function generateRemoteSpanContext({
  spanId,
  traceId,
  sampled,
  dsc,
}: {
  spanId: string;
  traceId: string;
  sampled: boolean | undefined;
  dsc?: Partial<DynamicSamplingContext>;
}): SpanContext {
  // We store the DSC as OTEL trace state on the span context
  const traceState = makeTraceState({
    dsc,
    sampled,
  });

  const spanContext: SpanContext = {
    traceId,
    spanId,
    isRemote: true,
    traceFlags: sampled ? TraceFlags.SAMPLED : TraceFlags.NONE,
    traceState,
  };

  return spanContext;
}
