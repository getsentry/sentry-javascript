import type { Span } from '@opentelemetry/api';
import type { Hub, Scope, TransactionMetadata } from '@sentry/types';

import type { AbstractSpan } from '../types';

// We store the parent span, scope & metadata in separate weakmaps, so we can access them for a given span
// This way we can enhance the data that an OTEL Span natively gives us
// and since we are using weakmaps, we do not need to clean up after ourselves
const SpanScope = new WeakMap<AbstractSpan, Scope>();
const SpanFinishScope = new WeakMap<AbstractSpan, Scope>();
const SpanHub = new WeakMap<AbstractSpan, Hub>();
const SpanParent = new WeakMap<AbstractSpan, Span>();
const SpanMetadata = new WeakMap<AbstractSpan, Partial<TransactionMetadata>>();

/** Set the Sentry scope on an OTEL span. */
export function setSpanScope(span: AbstractSpan, scope: Scope): void {
  SpanScope.set(span, scope);
}

/** Get the Sentry scope of an OTEL span. */
export function getSpanScope(span: AbstractSpan): Scope | undefined {
  return SpanScope.get(span);
}

/** Set the Sentry hub on an OTEL span. */
export function setSpanHub(span: AbstractSpan, hub: Hub): void {
  SpanHub.set(span, hub);
}

/** Get the Sentry hub of an OTEL span. */
export function getSpanHub(span: AbstractSpan): Hub | undefined {
  return SpanHub.get(span);
}

/** Set the parent OTEL span on an OTEL span. */
export function setSpanParent(span: AbstractSpan, parentSpan: Span): void {
  SpanParent.set(span, parentSpan);
}

/** Get the parent OTEL span of an OTEL span. */
export function getSpanParent(span: AbstractSpan): Span | undefined {
  return SpanParent.get(span);
}

/** Set metadata for an OTEL span. */
export function setSpanMetadata(span: AbstractSpan, metadata: Partial<TransactionMetadata>): void {
  SpanMetadata.set(span, metadata);
}

/** Get metadata for an OTEL span. */
export function getSpanMetadata(span: AbstractSpan): Partial<TransactionMetadata> | undefined {
  return SpanMetadata.get(span);
}

/** Set the Sentry scope to be used for finishing a given OTEL span. */
export function setSpanFinishScope(span: AbstractSpan, scope: Scope): void {
  SpanFinishScope.set(span, scope);
}

/** Get the Sentry scope to use for finishing an OTEL span. */
export function getSpanFinishScope(span: AbstractSpan): Scope | undefined {
  return SpanFinishScope.get(span);
}
