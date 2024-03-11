import type { Context, Span, SpanContext, SpanOptions, Tracer } from '@opentelemetry/api';
import { TraceFlags } from '@opentelemetry/api';
import { context } from '@opentelemetry/api';
import { SpanStatusCode, trace } from '@opentelemetry/api';
import { TraceState, suppressTracing } from '@opentelemetry/core';
import {
  SDK_VERSION,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  getClient,
  getCurrentScope,
  getRootSpan,
  handleCallbackErrors,
} from '@sentry/core';
import type { Client, Scope } from '@sentry/types';
import { dynamicSamplingContextToSentryBaggageHeader } from '@sentry/utils';
import { SENTRY_TRACE_STATE_DSC } from './constants';

import type { OpenTelemetryClient, OpenTelemetrySpanContext } from './types';
import { getContextFromScope } from './utils/contextData';
import { getDynamicSamplingContextFromSpan } from './utils/dynamicSamplingContext';

/**
 * Wraps a function with a transaction/span and finishes the span after the function is done.
 * The created span is the active span and will be used as parent by other spans created inside the function
 * and can be accessed via `Sentry.getSpan()`, as long as the function is executed while the scope is active.
 *
 * If you want to create a span that is not set as active, use {@link startInactiveSpan}.
 *
 * Note that you'll always get a span passed to the callback, it may just be a NonRecordingSpan if the span is not sampled.
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
        span.setStatus({ code: SpanStatusCode.ERROR });
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
 * Note that you'll always get a span passed to the callback, it may just be a NonRecordingSpan if the span is not sampled.
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
        span.setStatus({ code: SpanStatusCode.ERROR });
      },
    );
  });
}

/**
 * @deprecated Use {@link startSpan} instead.
 */
export const startActiveSpan = startSpan;

/**
 * Creates a span. This span is not set as active, so will not get automatic instrumentation spans
 * as children or be able to be accessed via `Sentry.getSpan()`.
 *
 * If you want to create a span that is set as active, use {@link startSpan}.
 *
 * Note that if you have not enabled tracing extensions via `addTracingExtensions`
 * or you didn't set `tracesSampleRate` or `tracesSampler`, this function will not generate spans
 * and the `span` returned from the callback will be undefined.
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
 * spans started within the callback will not be attached to a parent span.
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
  // eslint-disable-next-line deprecation/deprecation
  const { origin, op, source } = options;

  if (origin) {
    span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, origin);
  }

  if (op) {
    span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, op);
  }

  if (source) {
    span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, source);
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

  if (!forceTransaction) {
    return ctx;
  }

  // Else we need to "fix" the context to have no parent span
  const parentSpan = trace.getSpan(ctx);

  // If there is no parent span, all good, nothing to do!
  if (!parentSpan) {
    return ctx;
  }

  // Else, we need to do two things:
  // 1. Unset the parent span from the context, so we'll create a new root span
  // 2. Ensure the propagation context is correct, so we'll continue from the parent span
  const ctxWithoutSpan = trace.deleteSpan(ctx);

  const { spanId, traceId, traceFlags } = parentSpan.spanContext();
  // eslint-disable-next-line no-bitwise
  const sampled = Boolean(traceFlags & TraceFlags.SAMPLED);

  const rootSpan = getRootSpan(parentSpan);
  const dsc = getDynamicSamplingContextFromSpan(rootSpan);
  const dscString = dynamicSamplingContextToSentryBaggageHeader(dsc);

  const traceState = dscString ? new TraceState().set(SENTRY_TRACE_STATE_DSC, dscString) : undefined;

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
