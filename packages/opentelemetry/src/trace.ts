import type { Context, Span, SpanContext, SpanOptions, TimeInput, Tracer } from '@opentelemetry/api';
import { context, SpanStatusCode, trace, TraceFlags } from '@opentelemetry/api';
import { isTracingSuppressed, suppressTracing } from './utils/suppressTracing';
import type { Client, Scope, Span as SentrySpan } from '@sentry/core';
import {
  getClient,
  getCurrentScope,
  getDynamicSamplingContextFromSpan,
  getRootSpan,
  handleCallbackErrors,
  hasSpansEnabled,
  SDK_VERSION,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  spanToStaticSpanJSON,
} from '@sentry/core';
import type { OpenTelemetrySpanContext } from './types';
import { getContextFromScope } from './utils/contextData';
import { getSamplingDecision } from './utils/getSamplingDecision';
import { makeTraceState } from './utils/makeTraceState';
import { reconcileDscSampled } from './utils/reconcileDscSampled';
import { SENTRY_TRACE_STATE_DSC } from './constants';

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
    const missingRequiredParent = options.onlyIfParent && !trace.getSpan(activeCtx);
    const ctx = missingRequiredParent ? suppressTracing(activeCtx) : activeCtx;

    if (missingRequiredParent) {
      getClient()?.recordDroppedEvent('no_parent_span', 'span');
    }

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
          patchSpanEnd(span);
          // Run the callback under the original unsuppressed context (so custom OpenTelemetry spans
          // created inside are not suppressed) but with our span set as active. Without setting the
          // span here, `getActiveSpan()` inside the callback would resolve to a stale ancestor on
          // `activeCtx` (e.g. an outer span outside a `startNewTrace`/`continueTrace` boundary),
          // and event trace-context would attach to the wrong trace.
          // We use activeCtx (not ctx) because ctx may be suppressed when onlyIfParent is true
          // and no parent span exists. Using activeCtx ensures custom OTel spans are never
          // inadvertently suppressed.
          return context.with(trace.setSpan(activeCtx, span), () => {
            return handleCallbackErrors(
              () => callback(span),
              () => {
                // Only set the span status to ERROR when there wasn't any error status set before, in order to avoid stomping useful span statuses
                if (spanToStaticSpanJSON(span).status === 'ok') {
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
      patchSpanEnd(span);
      return handleCallbackErrors(
        () => callback(span),
        () => {
          // Only set the span status to ERROR when there wasn't any error status set before, in order to avoid stomping useful span statuses
          if (spanToStaticSpanJSON(span).status === 'ok') {
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
    const missingRequiredParent = options.onlyIfParent && !trace.getSpan(activeCtx);
    let ctx = missingRequiredParent ? suppressTracing(activeCtx) : activeCtx;

    if (missingRequiredParent) {
      getClient()?.recordDroppedEvent('no_parent_span', 'span');
    }

    const spanOptions = getSpanOptions(options);

    if (!hasSpansEnabled()) {
      ctx = isTracingSuppressed(ctx) ? ctx : suppressTracing(ctx);
    }

    const span = tracer.startSpan(name, spanOptions, ctx);
    patchSpanEnd(span);
    return span;
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
  // The node client has a `tracer` property, we use this if it exists, or else we use the global tracer
  const client = getClient<Client & { tracer?: Tracer }>();
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

/**
 * Wraps the span's `end()` method so that numeric timestamps passed in seconds
 * are converted to milliseconds before reaching OTel's native `Span.end()`.
 */
function patchSpanEnd(span: Span): void {
  const originalEnd = span.end.bind(span);
  span.end = (endTime?: TimeInput) => {
    return originalEnd(typeof endTime === 'number' ? ensureTimestampInMilliseconds(endTime) : endTime);
  };
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
  const rawDsc = getDynamicSamplingContextFromSpan(rootSpan);

  // When the root carried a frozen incoming DSC on its trace state, `getDynamicSamplingContextFromSpan`
  // returns it verbatim and it is immutable per the propagation spec. Otherwise core freshly derived the
  // DSC from the root's (binary) trace flags, which cannot tell a deferred decision apart from a
  // definitive unsampled one — reconcile `sampled` against the authoritative OTel decision so a deferred
  // parent (e.g. a `startNewTrace` remote parent with `traceFlags: NONE`) does not bake in `sampled=false`.
  const hasIncomingFrozenDsc = !!rootSpan.spanContext().traceState?.get(SENTRY_TRACE_STATE_DSC);
  const dsc = hasIncomingFrozenDsc ? rawDsc : reconcileDscSampled(rawDsc, sampled);

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

function getActiveSpanWrapper<T>(parentSpan: Span | SentrySpan | undefined | null): (callback: () => T) => T {
  return parentSpan !== undefined
    ? (callback: () => T) => {
        return withActiveSpan(parentSpan, callback);
      }
    : (callback: () => T) => callback();
}
