import type { Context, Span, SpanContext, SpanOptions, Tracer } from '@opentelemetry/api';
import { context, SpanStatusCode, trace, TraceFlags } from '@opentelemetry/api';
import { isTracingSuppressed, suppressTracing } from '@opentelemetry/core';
import type {
  Client,
  continueTrace as baseContinueTrace,
  DynamicSamplingContext,
  Scope,
  Span as SentrySpan,
  TraceContext,
} from '@sentry/core';
import {
  getClient,
  getCurrentScope,
  getDynamicSamplingContextFromScope,
  getDynamicSamplingContextFromSpan,
  getRootSpan,
  getTraceContextFromScope,
  handleCallbackErrors,
  hasSpansEnabled,
  SDK_VERSION,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  spanToJSON,
  spanToTraceContext,
} from '@sentry/core';
import { continueTraceAsRemoteSpan } from './propagator';
import type { OpenTelemetryClient, OpenTelemetrySpanContext } from './types';
import { getContextFromScope } from './utils/contextData';
import { getSamplingDecision } from './utils/getSamplingDecision';
import { makeTraceState } from './utils/makeTraceState';

/**
 * Internal helper for starting spans and manual spans. See {@link startSpan} and {@link startSpanManual} for the public APIs.
 * @param options - The span context options
 * @param callback - The callback to execute with the span
 * @param autoEnd - Whether to automatically end the span after the callback completes
 */
function _startSpan<T>(options: OpenTelemetrySpanContext, callback: (span: Span) => T, autoEnd: boolean): T {
  const tracer = getTracer();

  const { name, parentSpan: customParentSpan } = options;

  // If `options.parentSpan` is defined, we want to wrap the callback in `withActiveSpan`
  const wrapper = getActiveSpanWrapper<T>(customParentSpan);

  return wrapper(() => {
    const activeCtx = getContext(options.scope, options.forceTransaction);
    const shouldSkipSpan = options.onlyIfParent && !trace.getSpan(activeCtx);
    const ctx = shouldSkipSpan ? suppressTracing(activeCtx) : activeCtx;

    const spanOptions = getSpanOptions(options);

    // If spans are not enabled, ensure we suppress tracing for the span creation
    // but preserve the original context for the callback execution
    // This ensures that we don't create spans when tracing is disabled which
    // would otherwise be a problem for users that don't enable tracing but use
    // custom OpenTelemetry setups.
    if (!hasSpansEnabled()) {
      const suppressedCtx = isTracingSuppressed(ctx) ? ctx : suppressTracing(ctx);

      return context.with(suppressedCtx, () => {
        return tracer.startActiveSpan(name, spanOptions, suppressedCtx, span => {
          // Restore the original unsuppressed context for the callback execution
          // so that custom OpenTelemetry spans maintain the correct context.
          // We use activeCtx (not ctx) because ctx may be suppressed when onlyIfParent is true
          // and no parent span exists. Using activeCtx ensures custom OTel spans are never
          // inadvertently suppressed.
          return context.with(activeCtx, () => {
            return handleCallbackErrors(
              () => callback(span),
              () => {
                // Only set the span status to ERROR when there wasn't any status set before, in order to avoid stomping useful span statuses
                if (spanToJSON(span).status === undefined) {
                  span.setStatus({ code: SpanStatusCode.ERROR });
                }
              },
              autoEnd ? () => span.end() : undefined,
            );
          });
        });
      });
    }

    return tracer.startActiveSpan(name, spanOptions, ctx, span => {
      return handleCallbackErrors(
        () => callback(span),
        () => {
          // Only set the span status to ERROR when there wasn't any status set before, in order to avoid stomping useful span statuses
          if (spanToJSON(span).status === undefined) {
            span.setStatus({ code: SpanStatusCode.ERROR });
          }
        },
        autoEnd ? () => span.end() : undefined,
      );
    });
  });
}

/**
 * Wraps a function with a transaction/span and finishes the span after the function is done.
 * The created span is the active span and will be used as parent by other spans created inside the function
 * and can be accessed via `Sentry.getActiveSpan()`, as long as the function is executed while the scope is active.
 *
 * If you want to create a span that is not set as active, use {@link startInactiveSpan}.
 *
 * You'll always get a span passed to the callback,
 * it may just be a non-recording span if the span is not sampled or if tracing is disabled.
 */
export function startSpan<T>(options: OpenTelemetrySpanContext, callback: (span: Span) => T): T {
  return _startSpan(options, callback, true);
}

/**
 * Similar to `Sentry.startSpan`. Wraps a function with a span, but does not finish the span
 * after the function is done automatically. You'll have to call `span.end()` or the `finish` function passed to the callback manually.
 *
 * The created span is the active span and will be used as parent by other spans created inside the function
 * and can be accessed via `Sentry.getActiveSpan()`, as long as the function is executed while the scope is active.
 *
 * You'll always get a span passed to the callback,
 * it may just be a non-recording span if the span is not sampled or if tracing is disabled.
 */
export function startSpanManual<T>(
  options: OpenTelemetrySpanContext,
  callback: (span: Span, finish: () => void) => T,
): T {
  return _startSpan(options, span => callback(span, () => span.end()), false);
}

/**
 * Creates a span. This span is not set as active, so will not get automatic instrumentation spans
 * as children or be able to be accessed via `Sentry.getActiveSpan()`.
 *
 * If you want to create a span that is set as active, use {@link startSpan}.
 *
 * This function will always return a span,
 * it may just be a non-recording span if the span is not sampled or if tracing is disabled.
 */
export function startInactiveSpan(options: OpenTelemetrySpanContext): Span {
  const tracer = getTracer();

  const { name, parentSpan: customParentSpan } = options;

  // If `options.parentSpan` is defined, we want to wrap the callback in `withActiveSpan`
  const wrapper = getActiveSpanWrapper<Span>(customParentSpan);

  return wrapper(() => {
    const activeCtx = getContext(options.scope, options.forceTransaction);
    const shouldSkipSpan = options.onlyIfParent && !trace.getSpan(activeCtx);
    let ctx = shouldSkipSpan ? suppressTracing(activeCtx) : activeCtx;

    const spanOptions = getSpanOptions(options);

    if (!hasSpansEnabled()) {
      ctx = isTracingSuppressed(ctx) ? ctx : suppressTracing(ctx);
    }

    return tracer.startSpan(name, spanOptions, ctx);
  });
}

/**
 * Forks the current scope and sets the provided span as active span in the context of the provided callback. Can be
 * passed `null` to start an entirely new span tree.
 *
 * @param span Spans started in the context of the provided callback will be children of this span. If `null` is passed,
 * spans started within the callback will be root spans.
 * @param callback Execution context in which the provided span will be active. Is passed the newly forked scope.
 * @returns the value returned from the provided callback function.
 */
export function withActiveSpan<T>(span: Span | null, callback: (scope: Scope) => T): T {
  const newContextWithActiveSpan = span ? trace.setSpan(context.active(), span) : trace.deleteSpan(context.active());
  return context.with(newContextWithActiveSpan, () => callback(getCurrentScope()));
}

function getTracer(): Tracer {
  const client = getClient<Client & OpenTelemetryClient>();
  return client?.tracer || trace.getTracer('@sentry/opentelemetry', SDK_VERSION);
}

function getSpanOptions(options: OpenTelemetrySpanContext): SpanOptions {
  const { startTime, attributes, kind, op, links } = options;

  // OTEL expects timestamps in ms, not seconds
  const fixedStartTime = typeof startTime === 'number' ? ensureTimestampInMilliseconds(startTime) : startTime;

  return {
    attributes: op
      ? {
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: op,
          ...attributes,
        }
      : attributes,
    kind,
    links,
    startTime: fixedStartTime,
  };
}

function ensureTimestampInMilliseconds(timestamp: number): number {
  const isMs = timestamp < 9999999999;
  return isMs ? timestamp * 1000 : timestamp;
}

function getContext(scope: Scope | undefined, forceTransaction: boolean | undefined): Context {
  const ctx = getContextForScope(scope);
  const parentSpan = trace.getSpan(ctx);

  // In the case that we have no parent span, we start a new trace
  // Note that if we continue a trace, we'll always have a remote parent span here anyhow
  if (!parentSpan) {
    return ctx;
  }

  // If we don't want to force a transaction, and we have a parent span, all good, we just return as-is!
  if (!forceTransaction) {
    return ctx;
  }

  // Else, if we do have a parent span but want to force a transaction, we have to simulate a "root" context

  // Else, we need to do two things:
  // 1. Unset the parent span from the context, so we'll create a new root span
  // 2. Ensure the propagation context is correct, so we'll continue from the parent span
  const ctxWithoutSpan = trace.deleteSpan(ctx);

  const { spanId, traceId } = parentSpan.spanContext();
  const sampled = getSamplingDecision(parentSpan.spanContext());

  // In this case, when we are forcing a transaction, we want to treat this like continuing an incoming trace
  // so we set the traceState according to the root span
  const rootSpan = getRootSpan(parentSpan);
  const dsc = getDynamicSamplingContextFromSpan(rootSpan);

  const traceState = makeTraceState({
    dsc,
    sampled,
  });

  const spanOptions: SpanContext = {
    traceId,
    spanId,
    isRemote: true,
    traceFlags: sampled ? TraceFlags.SAMPLED : TraceFlags.NONE,
    traceState,
  };

  const ctxWithSpanContext = trace.setSpanContext(ctxWithoutSpan, spanOptions);

  return ctxWithSpanContext;
}

function getContextForScope(scope?: Scope): Context {
  if (scope) {
    const ctx = getContextFromScope(scope);
    if (ctx) {
      return ctx;
    }
  }

  return context.active();
}

/**
 * Continue a trace from `sentry-trace` and `baggage` values.
 * These values can be obtained from incoming request headers, or in the browser from `<meta name="sentry-trace">`
 * and `<meta name="baggage">` HTML tags.
 *
 * Spans started with `startSpan`, `startSpanManual` and `startInactiveSpan`, within the callback will automatically
 * be attached to the incoming trace.
 *
 * This is a custom version of `continueTrace` that is used in OTEL-powered environments.
 * It propagates the trace as a remote span, in addition to setting it on the propagation context.
 */
export function continueTrace<T>(options: Parameters<typeof baseContinueTrace>[0], callback: () => T): T {
  return continueTraceAsRemoteSpan(context.active(), options, callback);
}

/**
 * Get the trace context for a given scope.
 * We have a custom implementation here because we need an OTEL-specific way to get the span from a scope.
 */
export function getTraceContextForScope(
  client: Client,
  scope: Scope,
): [dynamicSamplingContext: Partial<DynamicSamplingContext>, traceContext: TraceContext] {
  const ctx = getContextFromScope(scope);
  const span = ctx && trace.getSpan(ctx);

  const traceContext = span ? spanToTraceContext(span) : getTraceContextFromScope(scope);

  const dynamicSamplingContext = span
    ? getDynamicSamplingContextFromSpan(span)
    : getDynamicSamplingContextFromScope(client, scope);
  return [dynamicSamplingContext, traceContext];
}

function getActiveSpanWrapper<T>(parentSpan: Span | SentrySpan | undefined | null): (callback: () => T) => T {
  return parentSpan !== undefined
    ? (callback: () => T) => {
        return withActiveSpan(parentSpan, callback);
      }
    : (callback: () => T) => callback();
}
