import type { Context, Span, SpanContext, SpanOptions, Tracer } from '@opentelemetry/api';
import { TraceFlags } from '@opentelemetry/api';
import { context } from '@opentelemetry/api';
import { SpanStatusCode, trace } from '@opentelemetry/api';
import { suppressTracing } from '@opentelemetry/core';
import {
  SDK_VERSION,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  continueTrace as baseContinueTrace,
  getClient,
  getCurrentScope,
  getRootSpan,
  handleCallbackErrors,
  spanToJSON,
} from '@sentry/core';
import type { Client, Scope } from '@sentry/types';
import { continueTraceAsRemoteSpan, makeTraceState } from './propagator';

import type { OpenTelemetryClient, OpenTelemetrySpanContext } from './types';
import { getContextFromScope, getScopesFromContext } from './utils/contextData';
import { getDynamicSamplingContextFromSpan } from './utils/dynamicSamplingContext';
import { getSamplingDecision } from './utils/getSamplingDecision';

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
  const tracer = getTracer();

  const { name } = options;

  const activeCtx = getContext(options.scope, options.forceTransaction);
  const shouldSkipSpan = options.onlyIfParent && !trace.getSpan(activeCtx);
  const ctx = shouldSkipSpan ? suppressTracing(activeCtx) : activeCtx;

  const spanContext = getSpanContext(options);

  return tracer.startActiveSpan(name, spanContext, ctx, span => {
    _applySentryAttributesToSpan(span, options);

    return handleCallbackErrors(
      () => callback(span),
      () => {
        // Only set the span status to ERROR when there wasn't any status set before, in order to avoid stomping useful span statuses
        if (spanToJSON(span).status === undefined) {
          span.setStatus({ code: SpanStatusCode.ERROR });
        }
      },
      () => span.end(),
    );
  });
}

/**
 * Similar to `Sentry.startSpan`. Wraps a function with a span, but does not finish the span
 * after the function is done automatically. You'll have to call `span.end()` manually.
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
  const tracer = getTracer();

  const { name } = options;

  const activeCtx = getContext(options.scope, options.forceTransaction);
  const shouldSkipSpan = options.onlyIfParent && !trace.getSpan(activeCtx);
  const ctx = shouldSkipSpan ? suppressTracing(activeCtx) : activeCtx;

  const spanContext = getSpanContext(options);

  return tracer.startActiveSpan(name, spanContext, ctx, span => {
    _applySentryAttributesToSpan(span, options);

    return handleCallbackErrors(
      () => callback(span, () => span.end()),
      () => {
        // Only set the span status to ERROR when there wasn't any status set before, in order to avoid stomping useful span statuses
        if (spanToJSON(span).status === undefined) {
          span.setStatus({ code: SpanStatusCode.ERROR });
        }
      },
    );
  });
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

  const { name } = options;

  const activeCtx = getContext(options.scope, options.forceTransaction);
  const shouldSkipSpan = options.onlyIfParent && !trace.getSpan(activeCtx);
  const ctx = shouldSkipSpan ? suppressTracing(activeCtx) : activeCtx;

  const spanContext = getSpanContext(options);

  const span = tracer.startSpan(name, spanContext, ctx);

  _applySentryAttributesToSpan(span, options);

  return span;
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
  return (client && client.tracer) || trace.getTracer('@sentry/opentelemetry', SDK_VERSION);
}

function _applySentryAttributesToSpan(span: Span, options: OpenTelemetrySpanContext): void {
  const { op } = options;

  if (op) {
    span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, op);
  }
}

function getSpanContext(options: OpenTelemetrySpanContext): SpanOptions {
  const { startTime, attributes, kind } = options;

  // OTEL expects timestamps in ms, not seconds
  const fixedStartTime = typeof startTime === 'number' ? ensureTimestampInMilliseconds(startTime) : startTime;

  return {
    attributes,
    kind,
    startTime: fixedStartTime,
  };
}

function ensureTimestampInMilliseconds(timestamp: number): number {
  const isMs = timestamp < 9999999999;
  return isMs ? timestamp * 1000 : timestamp;
}

function getContext(scope: Scope | undefined, forceTransaction: boolean | undefined): Context {
  const ctx = getContextForScope(scope);
  const actualScope = getScopesFromContext(ctx)?.scope;

  const parentSpan = trace.getSpan(ctx);

  // In the case that we have no parent span, we need to "simulate" one to ensure the propagation context is correct
  if (!parentSpan) {
    const client = getClient();

    if (actualScope && client) {
      const propagationContext = actualScope.getPropagationContext();

      // We store the DSC as OTEL trace state on the span context
      const traceState = makeTraceState({
        parentSpanId: propagationContext.parentSpanId,
        // Not defined yet, we want to pick this up on-demand only
        dsc: undefined,
        sampled: propagationContext.sampled,
      });

      const spanContext: SpanContext = {
        traceId: propagationContext.traceId,
        spanId: propagationContext.parentSpanId || propagationContext.spanId,
        isRemote: true,
        traceFlags: propagationContext.sampled ? TraceFlags.SAMPLED : TraceFlags.NONE,
        traceState,
      };

      // Add remote parent span context,
      return trace.setSpanContext(ctx, spanContext);
    }

    // if we have no scope or client, we just return the context as-is
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
    parentSpanId: spanId,
    sampled,
  });

  const spanContext: SpanContext = {
    traceId,
    spanId,
    isRemote: true,
    traceFlags: sampled ? TraceFlags.SAMPLED : TraceFlags.NONE,
    traceState,
  };

  const ctxWithSpanContext = trace.setSpanContext(ctxWithoutSpan, spanContext);

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
  return baseContinueTrace(options, () => {
    return continueTraceAsRemoteSpan(context.active(), options, callback);
  });
}
