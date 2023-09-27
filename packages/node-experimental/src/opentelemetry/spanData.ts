import type { Span as OtelSpan } from '@opentelemetry/api';
import type { Hub, Scope, TransactionMetadata } from '@sentry/types';

// We store the parent span, scope & metadata in separate weakmaps, so we can access them for a given span
// This way we can enhance the data that an OTEL Span natively gives us
// and since we are using weakmaps, we do not need to clean up after ourselves
const otelSpanScope = new WeakMap<OtelSpan, Scope>();
const otelSpanHub = new WeakMap<OtelSpan, Hub>();
const otelSpanParent = new WeakMap<OtelSpan, OtelSpan>();
const otelSpanMetadata = new WeakMap<OtelSpan, Partial<TransactionMetadata>>();

/** Set the Sentry scope on an OTEL span. */
export function setOtelSpanScope(span: OtelSpan, scope: Scope): void {
  otelSpanScope.set(span, scope);
}

/** Get the Sentry scope of an OTEL span. */
export function getOtelSpanScope(span: OtelSpan): Scope | undefined {
  return otelSpanScope.get(span);
}

/** Set the Sentry hub on an OTEL span. */
export function setOtelSpanHub(span: OtelSpan, hub: Hub): void {
  otelSpanHub.set(span, hub);
}

/** Get the Sentry hub of an OTEL span. */
export function getOtelSpanHub(span: OtelSpan): Hub | undefined {
  return otelSpanHub.get(span);
}

/** Set the parent OTEL span on an OTEL span. */
export function setOtelSpanParent(span: OtelSpan, parentSpan: OtelSpan): void {
  otelSpanParent.set(span, parentSpan);
}

/** Get the parent OTEL span of an OTEL span. */
export function getOtelSpanParent(span: OtelSpan): OtelSpan | undefined {
  return otelSpanParent.get(span);
}

/** Set metadata for an OTEL span. */
export function setOtelSpanMetadata(span: OtelSpan, metadata: Partial<TransactionMetadata>): void {
  otelSpanMetadata.set(span, metadata);
}

/** Get metadata for an OTEL span. */
export function getOtelSpanMetadata(span: OtelSpan): Partial<TransactionMetadata> | undefined {
  return otelSpanMetadata.get(span);
}
