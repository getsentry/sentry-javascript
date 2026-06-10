/* eslint-disable max-lines */
import type {
  Context,
  Span as OpenTelemetrySpan,
  SpanOptions,
  Tracer,
  TracerOptions,
  TracerProvider,
} from '@opentelemetry/api';
import { context, SpanKind, trace } from '@opentelemetry/api';
import { isTracingSuppressed } from '@opentelemetry/core';
import {
  _INTERNAL_safeMathRandom,
  _INTERNAL_setSpanForScope,
  addNonEnumerableProperty,
  getCurrentScope,
  getDynamicSamplingContextFromSpan,
  getIsolationScope,
  SEMANTIC_ATTRIBUTE_SENTRY_CUSTOM_SPAN_NAME,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  SentryNonRecordingSpan,
  getCapturedScopesOnSpan,
  getSpanStatusFromHttpCode,
  setCapturedScopesOnSpan,
  spanToJSON,
  SPAN_STATUS_ERROR,
  SPAN_STATUS_OK,
  _INTERNAL_startInactiveSpan,
  startNewTrace,
  withScope,
} from '@sentry/core';
import type { Span, SpanAttributes, SpanLink, SpanStatus } from '@sentry/core';
import { SENTRY_FORK_SET_ISOLATION_SCOPE_CONTEXT_KEY } from './constants';
import { inferSpanData } from './utils/parseSpanDescription';
import { getSamplingDecision } from './utils/getSamplingDecision';

type SentrySpanWithOtelKind = Span & { kind?: SpanKind };
type SentrySpanWithOtelSourceInference = Span & { _sentryOtelInferSource?: boolean };

const HTTP_RESPONSE_STATUS_CODE_ATTRIBUTE = 'http.response.status_code';
const LEGACY_HTTP_RESPONSE_STATUS_CODE_ATTRIBUTE = 'http.status_code';
const RPC_GRPC_STATUS_CODE_ATTRIBUTE = 'rpc.grpc.status_code';

const VALID_SPAN_STATUS_MESSAGES = new Set([
  'ok',
  'deadline_exceeded',
  'unauthenticated',
  'permission_denied',
  'not_found',
  'resource_exhausted',
  'invalid_argument',
  'unimplemented',
  'unavailable',
  'internal_error',
  'unknown_error',
  'cancelled',
  'already_exists',
  'failed_precondition',
  'aborted',
  'out_of_range',
  'data_loss',
]);

const GRPC_STATUS_CODE_MAP: Record<string, string> = {
  '1': 'cancelled',
  '2': 'unknown_error',
  '3': 'invalid_argument',
  '4': 'deadline_exceeded',
  '5': 'not_found',
  '6': 'already_exists',
  '7': 'permission_denied',
  '8': 'resource_exhausted',
  '9': 'failed_precondition',
  '10': 'aborted',
  '11': 'out_of_range',
  '12': 'unimplemented',
  '13': 'internal_error',
  '14': 'unavailable',
  '15': 'data_loss',
  '16': 'unauthenticated',
};

/**
 * A minimal OpenTelemetry TracerProvider which creates native Sentry spans.
 */
export class SentryTraceProvider implements TracerProvider {
  public readonly resource?: { attributes: SpanAttributes };

  private readonly _tracers = new Map<string, SentryTracer>();

  public constructor(options: { resource?: { attributes: SpanAttributes } } = {}) {
    this.resource = options.resource;
  }

  /** @inheritdoc */
  public getTracer(name: string, version?: string, options?: TracerOptions): Tracer {
    const key = JSON.stringify([name, version, options]);
    const cachedTracer = this._tracers.get(key);
    if (cachedTracer) {
      return cachedTracer;
    }

    const tracer = new SentryTracer();
    this._tracers.set(key, tracer);
    return tracer;
  }

  /** Compatibility with SDK tracer providers. */
  public forceFlush(): Promise<void> {
    return Promise.resolve();
  }

  /** Compatibility with SDK tracer providers. */
  public shutdown(): Promise<void> {
    return Promise.resolve();
  }
}

class SentryTracer implements Tracer {
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
      addNonEnumerableProperty(span as SentrySpanWithOtelSourceInference, '_sentryOtelInferSource', true);
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

    return _INTERNAL_startInactiveSpan({
      ...sentryOptions,
      parentSpan: hasExplicitContext ? null : undefined,
    });
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
    const parentSpanContext = parentSpan?.spanContext();
    const span = new SentryNonRecordingSpan({
      traceId: parentSpanContext?.traceId,
      parentSpanId: parentSpanContext?.spanId,
    });
    // Capture the scopes (mirroring `createChildOrRootSpan`) so `startActiveSpan` can
    // fork the isolation scope onto the OTel context for work inside a suppressed span.
    setCapturedScopesOnSpan(span, getCurrentScope(), getIsolationScope());
    return span as OpenTelemetrySpan;
  }
}

/** Apply OTel semantic inference to a Sentry span. */
export function applyOtelSpanData(span: Span, options: { finalizeStatus?: boolean } = {}): void {
  const spanJSON = spanToJSON(span);
  const attributes = spanJSON.data;
  const kind = (span as SentrySpanWithOtelKind).kind ?? SpanKind.INTERNAL;
  const mayInferSource = (span as SentrySpanWithOtelSourceInference)._sentryOtelInferSource === true;
  const hasCustomSpanName = attributes[SEMANTIC_ATTRIBUTE_SENTRY_CUSTOM_SPAN_NAME] !== undefined;
  const attributesForInference =
    mayInferSource && !hasCustomSpanName && attributes[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE] === 'custom'
      ? { ...attributes, [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: undefined }
      : attributes;
  const inferred = inferSpanData(spanJSON.description || '<unknown>', attributesForInference, kind);

  if (kind !== SpanKind.INTERNAL && attributes['otel.kind'] === undefined) {
    span.setAttribute('otel.kind', SpanKind[kind]);
  }

  if (inferred.op && attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP] === undefined) {
    span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, inferred.op);
  }

  // Don't apply 'url' source at creation time — only at span end (finalizeStatus).
  // At creation, http.route may not be set yet, so inference falls back to 'url'.
  // Keeping the default 'custom' source from _startRootSpan allows
  // enhanceDscWithOpenTelemetryRootSpanName to include the transaction name in
  // the DSC. At span end, http.route is typically available and inference returns
  // 'route' instead. If it's still 'url', it's applied then.
  const shouldApplyInferredSource =
    inferred.source !== undefined &&
    inferred.source !== 'custom' &&
    (options.finalizeStatus || inferred.source !== 'url') &&
    (spanJSON.parent_span_id === undefined || kind === SpanKind.SERVER);

  if (
    shouldApplyInferredSource &&
    (attributes[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE] === undefined || (mayInferSource && !hasCustomSpanName))
  ) {
    span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, inferred.source);
  }

  if (inferred.data) {
    Object.entries(inferred.data).forEach(([key, value]) => {
      if (value !== undefined && attributes[key] === undefined) {
        span.setAttribute(key, value);
      }
    });
  }

  if (options.finalizeStatus) {
    applyOtelCompatibilityAttributes(span, attributes);
    applyOtelSpanStatus(span, attributes, spanJSON.status);
  }

  if (
    inferred.description !== spanJSON.description &&
    (attributes[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE] !== 'custom' || (mayInferSource && !hasCustomSpanName))
  ) {
    addNonEnumerableProperty(span as Span & { _name?: string }, '_name', inferred.description);
  }
}

function applyOtelSpanKind(span: Span, kind: SpanKind | undefined): void {
  addNonEnumerableProperty(span as SentrySpanWithOtelKind, 'kind', kind ?? SpanKind.INTERNAL);
}

function applyOtelSpanStatus(span: Span, attributes: SpanAttributes, status: string | undefined): void {
  if (status === undefined) {
    const inferredStatus = inferOtelSpanStatusFromAttributes(attributes);
    span.setStatus(inferredStatus || { code: SPAN_STATUS_OK });
    return;
  }

  if (!VALID_SPAN_STATUS_MESSAGES.has(status)) {
    span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
  }
}

function applyOtelCompatibilityAttributes(span: Span, attributes: SpanAttributes): void {
  const legacyHttpStatusCode = attributes[LEGACY_HTTP_RESPONSE_STATUS_CODE_ATTRIBUTE];

  if (attributes[HTTP_RESPONSE_STATUS_CODE_ATTRIBUTE] === undefined && legacyHttpStatusCode !== undefined) {
    span.setAttribute(HTTP_RESPONSE_STATUS_CODE_ATTRIBUTE, legacyHttpStatusCode);
    attributes[HTTP_RESPONSE_STATUS_CODE_ATTRIBUTE] = legacyHttpStatusCode;
  }
}

function inferOtelSpanStatusFromAttributes(attributes: SpanAttributes): SpanStatus | undefined {
  const httpCodeAttribute =
    attributes[HTTP_RESPONSE_STATUS_CODE_ATTRIBUTE] ?? attributes[LEGACY_HTTP_RESPONSE_STATUS_CODE_ATTRIBUTE];
  const grpcCodeAttribute = attributes[RPC_GRPC_STATUS_CODE_ATTRIBUTE];

  const numberHttpCode =
    typeof httpCodeAttribute === 'number'
      ? httpCodeAttribute
      : typeof httpCodeAttribute === 'string'
        ? parseInt(httpCodeAttribute, 10)
        : undefined;

  if (typeof numberHttpCode === 'number') {
    return getSpanStatusFromHttpCode(numberHttpCode);
  }

  if (typeof grpcCodeAttribute === 'string') {
    return { code: SPAN_STATUS_ERROR, message: GRPC_STATUS_CODE_MAP[grpcCodeAttribute] || 'unknown_error' };
  }

  return undefined;
}
