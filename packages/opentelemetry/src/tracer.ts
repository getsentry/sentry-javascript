import type { Context, Span as OpenTelemetrySpan, SpanOptions, Tracer } from '@opentelemetry/api';
import { context, isSpanContextValid, trace } from '@opentelemetry/api';
import { isTracingSuppressed } from './utils/suppressTracing';
import {
  _INTERNAL_safeMathRandom,
  _INTERNAL_setSpanForScope,
  _INTERNAL_startInactiveSpan,
  addChildSpanToSpan,
  getCapturedScopesOnSpan,
  getCurrentScope,
  getDynamicSamplingContextFromSpan,
  getIsolationScope,
  markSpanAsTracerProviderSpan,
  SentryNonRecordingSpan,
  setCapturedScopesOnSpan,
  spanIsIgnored,
  spanKindToName,
  startNewTrace,
  withScope,
} from '@sentry/core';
import type { Span, SpanAttributes } from '@sentry/core';
import { SENTRY_FORK_SET_ISOLATION_SCOPE_CONTEXT_KEY, SENTRY_TRACE_STATE_DSC } from './constants';
import { getSamplingDecision } from './utils/getSamplingDecision';
import { SENTRY_KIND } from '@sentry/conventions/attributes';

export class SentryTracer implements Tracer {
  /** @inheritdoc */
  public startSpan(name: string, options: SpanOptions = {}, ctx?: Context): OpenTelemetrySpan {
    const parentContext = ctx || context.active();
    const parentSpanCandidate = options.root ? undefined : trace.getSpan(parentContext);
    // Ignore an invalid parent (e.g. a malformed incoming trace/span id) and start a fresh trace,
    // matching the OTel SDK sampler's `getValidSpan` behaviour.
    const parentSpan =
      parentSpanCandidate && isSpanContextValid(parentSpanCandidate.spanContext()) ? parentSpanCandidate : undefined;

    if (isTracingSuppressed(parentContext)) {
      return this._createNonRecordingSpan(parentSpan);
    }

    const span = this._startSentrySpan(name, options, parentSpan, ctx !== undefined);

    // Mark the span as provider-created so it becomes immutable after `end()` like an OTel SDK span
    // (see `SentrySpan.end()`). Spans created directly through the core API (e.g. the browser SDK)
    // are not marked and keep their mutable behavior.
    markSpanAsTracerProviderSpan(span);

    return span;
  }

  /** @inheritdoc */
  public startActiveSpan<F extends (span: OpenTelemetrySpan) => unknown>(name: string, fn: F): ReturnType<F>;
  public startActiveSpan<F extends (span: OpenTelemetrySpan) => unknown>(
    name: string,
    options: SpanOptions,
    fn: F,
  ): ReturnType<F>;
  public startActiveSpan<F extends (span: OpenTelemetrySpan) => unknown>(
    name: string,
    options: SpanOptions,
    ctx: Context,
    fn: F,
  ): ReturnType<F>;
  public startActiveSpan<F extends (span: OpenTelemetrySpan) => unknown>(
    name: string,
    optionsOrFn: SpanOptions | F,
    contextOrFn?: Context | F,
    fn?: F,
  ): ReturnType<F> {
    const options = typeof optionsOrFn === 'function' ? {} : optionsOrFn;
    const ctx = typeof contextOrFn === 'function' || contextOrFn === undefined ? context.active() : contextOrFn;
    const callback = (
      typeof optionsOrFn === 'function' ? optionsOrFn : typeof contextOrFn === 'function' ? contextOrFn : fn
    ) as F;

    const span = this.startSpan(name, options, ctx);

    // Run the span's callback under the isolation scope captured when the span was created, so scope state
    // used or set during the span (tags, breadcrumbs, captured errors) belongs to that span and stays
    // isolated from other concurrent work. Without this it can land on a different isolation scope. This
    // holds for ignored spans too, which run the callback without ever becoming the active span.
    const capturedIsolationScope = getCapturedScopesOnSpan(span).isolationScope;
    const withCapturedIsolationScope = (contextToFork: Context): Context =>
      capturedIsolationScope
        ? contextToFork.setValue(SENTRY_FORK_SET_ISOLATION_SCOPE_CONTEXT_KEY, capturedIsolationScope)
        : contextToFork;

    // Mirror core's `startSpan`: an ignored (`ignoreSpans`) span that has a parent must not become the
    // active span. Otherwise its children would attach to it and, since it's non-recording, be dropped
    // along with it (cascading the drop down the whole subtree). Leaving the parent active lets the
    // children attach to it and get re-parented instead. An ignored root span has no parent and still
    // becomes active, so its subtree is dropped as intended.
    if (spanIsIgnored(span) && trace.getSpan(ctx)) {
      return context.with(withCapturedIsolationScope(ctx), () => callback(span)) as ReturnType<F>;
    }

    return context.with(withCapturedIsolationScope(trace.setSpan(ctx, span)), () => {
      _INTERNAL_setSpanForScope(getCurrentScope(), span);
      return callback(span) as ReturnType<F>;
    });
  }

  private _startSentrySpan(
    name: string,
    options: SpanOptions,
    parentSpan: OpenTelemetrySpan | undefined,
    hasExplicitContext: boolean,
  ): Span {
    const sentryOptions = {
      name,
      attributes: (options.attributes as SpanAttributes) || {},
      links: options.links,
      startTime: options.startTime,
    };

    // Convert otel kind to our sentry.kind attribtue
    if (options.kind) {
      sentryOptions.attributes[SENTRY_KIND] = spanKindToName(options.kind);
    }

    if (options.root) {
      return startNewTrace(() => _INTERNAL_startInactiveSpan({ ...sentryOptions, parentSpan: null }));
    }

    if (parentSpan?.spanContext().isRemote) {
      return this._startRootSpanWithRemoteParent(sentryOptions, parentSpan);
    }

    if (parentSpan) {
      return _INTERNAL_startInactiveSpan({ ...sentryOptions, parentSpan: parentSpan });
    }

    // No parent span and no remote parent: this is a fresh root span.
    return _INTERNAL_startInactiveSpan({
      ...sentryOptions,
      parentSpan: hasExplicitContext ? null : undefined,
    });
  }

  private _startRootSpanWithRemoteParent(
    options: Parameters<typeof _INTERNAL_startInactiveSpan>[0],
    parentSpan: OpenTelemetrySpan,
  ): Span {
    const { spanId, traceId, traceState } = parentSpan.spanContext();
    const dsc = getDynamicSamplingContextFromSpan(parentSpan);
    const sampleRand = typeof dsc.sample_rand === 'string' ? Number(dsc.sample_rand) : undefined;

    // Only freeze the DSC when the remote parent actually carried one (i.e. there was incoming
    // baggage). Otherwise leave it unset so it is derived dynamically from the span — picking up the
    // span's `transaction` name and the generated `sample_rand` — matching the OpenTelemetry SDK.
    const hasIncomingDsc = !!traceState?.get(SENTRY_TRACE_STATE_DSC);

    return withScope(scope => {
      scope.setPropagationContext({
        traceId,
        parentSpanId: spanId,
        sampled: getSamplingDecision(parentSpan.spanContext()),
        dsc: hasIncomingDsc ? dsc : undefined,
        sampleRand:
          typeof sampleRand === 'number' && !Number.isNaN(sampleRand) ? sampleRand : _INTERNAL_safeMathRandom(),
      });
      _INTERNAL_setSpanForScope(scope, undefined);

      return _INTERNAL_startInactiveSpan({ ...options, parentSpan: null });
    });
  }

  private _createNonRecordingSpan(parentSpan: OpenTelemetrySpan | undefined): OpenTelemetrySpan {
    // Without a parent, fall back to the current scope's propagation context trace id, so that
    // non-recording spans (TwP mode) stay on the trace set by `startNewTrace`/`continueTrace`
    // instead of minting a fresh random trace id. Mirrors core's `createChildOrRootSpan` TwP branch.
    const traceId = parentSpan?.spanContext().traceId ?? getCurrentScope().getPropagationContext().traceId;
    const span = new SentryNonRecordingSpan({ traceId });
    // Link to the parent (like core's `createChildOrRootSpan`) so `getRootSpan` and DSC
    // resolution reach the parent. Non-recording spans no longer carry a `parentSpanId`.
    if (parentSpan) {
      addChildSpanToSpan(parentSpan, span);
    }
    // Capture the scopes (mirroring `createChildOrRootSpan`) so `startActiveSpan` can
    // fork the isolation scope onto the OTel context for work inside a suppressed span.
    setCapturedScopesOnSpan(span, getCurrentScope(), getIsolationScope());
    return span;
  }
}
