import { SpanKind } from '@opentelemetry/api';
import { HTTP_RESPONSE_STATUS_CODE, HTTP_STATUS_CODE } from '@sentry/conventions/attributes';
import {
  addNonEnumerableProperty,
  SEMANTIC_ATTRIBUTE_SENTRY_CUSTOM_SPAN_NAME,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  spanShouldInferOtelSource,
  spanToJSON,
  SPAN_STATUS_ERROR,
  SPAN_STATUS_OK,
} from '@sentry/core';
import type { Span, SpanAttributes } from '@sentry/core';
import { inferStatusFromAttributes, isStatusErrorMessageValid } from './utils/mapStatus';
import { inferSpanData } from './utils/parseSpanDescription';

type SentrySpanWithOtelKind = Span & { kind?: SpanKind };

/**
 * Backfill a native Sentry span with the data the OpenTelemetry SDK pipeline would otherwise derive
 * from OTel semantic attributes: `sentry.op`, `sentry.source`, the span name, `otel.kind`, and status.
 *
 * On the OTel SDK provider this happens in the `SentrySpanProcessor`/`SentrySpanExporter` while
 * converting `ReadableSpan`s to Sentry payloads (via `parseSpanDescription` + `mapStatus`).
 * `SentryTracerProvider` creates native Sentry spans directly and never goes through that pipeline,
 * so the same inference has to run here instead — once at span start, and again at span end
 * (`finalizeStatus`, once attributes like `http.route` and the status code are available).
 */
export function applyOtelSpanData(span: Span, options: { finalizeStatus?: boolean } = {}): void {
  const spanJSON = spanToJSON(span);
  const attributes = spanJSON.data;
  const kind = (span as SentrySpanWithOtelKind).kind ?? SpanKind.INTERNAL;
  const mayInferSource = spanShouldInferOtelSource(span);
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

  // Don't apply 'url' source at creation time, only at span end (finalizeStatus).
  // At creation, http.route may not be set yet, so inference falls back to 'url'.
  // Keeping the default 'custom' source from _startRootSpan allows
  // enhanceDscWithOpenTelemetryRootSpanName to include the transaction name in
  // the DSC. At span end, http.route is typically available and inference returns
  // 'route' instead. If it's still 'url', it's applied then.
  // We also only set `source` on segment roots (spans that become transactions):
  // those with no parent, plus SERVER spans, which are the segment root even when
  // continuing a distributed trace (where they carry a remote `parent_span_id`).
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
    span.updateName(inferred.description);
  }
}

/** Stash the OTel span kind on a Sentry span so {@link applyOtelSpanData} can read it. */
export function applyOtelSpanKind(span: Span, kind: SpanKind | undefined): void {
  addNonEnumerableProperty(span as SentrySpanWithOtelKind, 'kind', kind ?? SpanKind.INTERNAL);
}

function applyOtelSpanStatus(span: Span, attributes: SpanAttributes, status: string | undefined): void {
  if (status === undefined) {
    span.setStatus(inferStatusFromAttributes(attributes) || { code: SPAN_STATUS_OK });
    return;
  }

  if (status !== 'ok' && !isStatusErrorMessageValid(status)) {
    span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
  }
}

function applyOtelCompatibilityAttributes(span: Span, attributes: SpanAttributes): void {
  // `http.status_code` is the deprecated legacy attribute, read for backward compatibility.
  // eslint-disable-next-line typescript/no-deprecated
  const legacyHttpStatusCode = attributes[HTTP_STATUS_CODE];

  if (attributes[HTTP_RESPONSE_STATUS_CODE] === undefined && legacyHttpStatusCode !== undefined) {
    span.setAttribute(HTTP_RESPONSE_STATUS_CODE, legacyHttpStatusCode);
    attributes[HTTP_RESPONSE_STATUS_CODE] = legacyHttpStatusCode;
  }
}
