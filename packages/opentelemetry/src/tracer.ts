import type { Context, Span as OpenTelemetrySpan, SpanOptions, Tracer } from '@opentelemetry/api';
import { context, trace } from '@opentelemetry/api';
import { isTracingSuppressed } from '@opentelemetry/core';
import {
  _INTERNAL_safeMathRandom,
  _INTERNAL_setSpanForScope,
  _INTERNAL_startInactiveSpan,
  addChildSpanToSpan,
  getCapturedScopesOnSpan,
  getCurrentScope,
  getDynamicSamplingContextFromSpan,
  getIsolationScope,
  markSpanForOtelSourceInference,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  SentryNonRecordingSpan,
  setCapturedScopesOnSpan,
  startNewTrace,
  withScope,
} from '@sentry/core';
import type { Span, SpanAttributes, SpanLink } from '@sentry/core';
import { applyOtelSpanData, applyOtelSpanKind } from './applyOtelSpanData';
import { SENTRY_FORK_SET_ISOLATION_SCOPE_CONTEXT_KEY } from './constants';
import { getSamplingDecision } from './utils/getSamplingDecision';

export class SentryTracer implements Tracer {
  /** @inheritdoc */
  public startSpan(name: string, options: SpanOptions = {}, ctx?: Context): OpenTelemetrySpan {
    const parentContext = ctx || context.active();
    const parentSpan = options.root ? undefined : trace.getSpan(parentContext);

    if (isTracingSuppressed(parentContext)) {
      return this._createNonRecordingSpan(parentSpan);
    }

    const span = this._startSentrySpan(name, options, parentSpan, ctx !== undefined);

    applyOtelSpanKind(span, options.kind);
    if (options.attributes?.[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE] === undefined) {
      markSpanForOtelSourceInference(span);
    }
    applyOtelSpanData(span);
    return span as OpenTelemetrySpan;
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
    let ctxWithSpan = trace.setSpan(ctx, span);

    // Run the span's callback under the isolation scope captured when the span was created, so scope state
    // used or set during the span (tags, breadcrumbs, captured errors) belongs to that span and stays
    // isolated from other concurrent work. Without this it can land on a different isolation scope.
    const capturedIsolationScope = getCapturedScopesOnSpan(span as unknown as Span).isolationScope;
    if (capturedIsolationScope) {
      ctxWithSpan = ctxWithSpan.setValue(SENTRY_FORK_SET_ISOLATION_SCOPE_CONTEXT_KEY, capturedIsolationScope);
    }

    return context.with(ctxWithSpan, () => {
      _INTERNAL_setSpanForScope(getCurrentScope(), span as unknown as Span);
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
      attributes: options.attributes as SpanAttributes | undefined,
      links: options.links as SpanLink[] | undefined,
      startTime: options.startTime,
    };

    if (options.root) {
      return startNewTrace(() => _INTERNAL_startInactiveSpan({ ...sentryOptions, parentSpan: null }));
    }

    if (parentSpan?.spanContext().isRemote) {
      return this._startRootSpanWithRemoteParent(sentryOptions, parentSpan);
    }

    if (parentSpan) {
      return _INTERNAL_startInactiveSpan({ ...sentryOptions, parentSpan: parentSpan as unknown as Span });
    }

    // No parent span and no remote parent: this is a fresh root span. Start a new trace instead of
    // continuing the scope's (possibly auto-generated) propagation context, matching the OpenTelemetry
    // SDK where each root span without an incoming trace gets its own trace id.
    return startNewTrace(() =>
      _INTERNAL_startInactiveSpan({
        ...sentryOptions,
        parentSpan: hasExplicitContext ? null : undefined,
      }),
    );
  }

  private _startRootSpanWithRemoteParent(
    options: Parameters<typeof _INTERNAL_startInactiveSpan>[0],
    parentSpan: OpenTelemetrySpan,
  ): Span {
    const { spanId, traceId } = parentSpan.spanContext();
    const dsc = getDynamicSamplingContextFromSpan(parentSpan as unknown as Span);
    const sampleRand = typeof dsc.sample_rand === 'string' ? Number(dsc.sample_rand) : undefined;

    return withScope(scope => {
      scope.setPropagationContext({
        traceId,
        parentSpanId: spanId,
        sampled: getSamplingDecision(parentSpan.spanContext()),
        dsc,
        sampleRand:
          typeof sampleRand === 'number' && !Number.isNaN(sampleRand) ? sampleRand : _INTERNAL_safeMathRandom(),
      });
      _INTERNAL_setSpanForScope(scope, undefined);

      return _INTERNAL_startInactiveSpan({ ...options, parentSpan: null });
    });
  }

  private _createNonRecordingSpan(parentSpan: OpenTelemetrySpan | undefined): OpenTelemetrySpan {
    const span = new SentryNonRecordingSpan({ traceId: parentSpan?.spanContext().traceId });
    // Link to the parent (like core's `createChildOrRootSpan`) so `getRootSpan` and DSC
    // resolution reach the parent. Non-recording spans no longer carry a `parentSpanId`.
    if (parentSpan) {
      addChildSpanToSpan(parentSpan as unknown as Span, span);
    }
    // Capture the scopes (mirroring `createChildOrRootSpan`) so `startActiveSpan` can
    // fork the isolation scope onto the OTel context for work inside a suppressed span.
    setCapturedScopesOnSpan(span, getCurrentScope(), getIsolationScope());
    return span as OpenTelemetrySpan;
  }
}
