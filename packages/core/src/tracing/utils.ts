import type { Scope } from '../scope';
import type { Span } from '../types/span';
import { addNonEnumerableProperty } from '../utils/object';
import { derefWeakRef, makeWeakRef, type MaybeWeakRef } from '../utils/weakRef';

const SCOPE_ON_START_SPAN_FIELD = '_sentryScope';
const ISOLATION_SCOPE_ON_START_SPAN_FIELD = '_sentryIsolationScope';

// Brand marking a span whose `sentry.source` should be inferred OTel-style at span end (by
// `applyOtelSpanData`) rather than pinned. `SentryTraceProvider` sets it on the spans it creates
// so they behave like OTel SDK spans, which carry no Sentry source concept. We use `Symbol.for`
// so the key is shared across duplicated copies of `@sentry/core`.
const OTEL_SOURCE_INFERENCE_SPAN_FIELD = Symbol.for('sentry.otelSourceInference');

type SpanWithScopes = Span & {
  [SCOPE_ON_START_SPAN_FIELD]?: Scope;
  [ISOLATION_SCOPE_ON_START_SPAN_FIELD]?: MaybeWeakRef<Scope>;
};

type SpanWithOtelSourceInference = Span & {
  [OTEL_SOURCE_INFERENCE_SPAN_FIELD]?: boolean;
};

/** Store the scope & isolation scope for a span, which can the be used when it is finished. */
export function setCapturedScopesOnSpan(span: Span | undefined, scope: Scope, isolationScope: Scope): void {
  if (span) {
    addNonEnumerableProperty(span, ISOLATION_SCOPE_ON_START_SPAN_FIELD, makeWeakRef(isolationScope));
    // We don't wrap the scope with a WeakRef here because webkit aggressively garbage collects
    // and scopes are not held in memory for long periods of time.
    addNonEnumerableProperty(span, SCOPE_ON_START_SPAN_FIELD, scope);
  }
}

/**
 * Grabs the scope and isolation scope off a span that were active when the span was started.
 * If WeakRef was used and scopes have been garbage collected, returns undefined for those scopes.
 */
export function getCapturedScopesOnSpan(span: Span): { scope?: Scope; isolationScope?: Scope } {
  const spanWithScopes = span as SpanWithScopes;

  return {
    scope: spanWithScopes[SCOPE_ON_START_SPAN_FIELD],
    isolationScope: derefWeakRef(spanWithScopes[ISOLATION_SCOPE_ON_START_SPAN_FIELD]),
  };
}

/**
 * Mark a span as eligible for OTel-style `sentry.source` inference at span end.
 * Set by `SentryTraceProvider` on the spans it creates; read by `SentrySpan.updateName()` and
 * `applyOtelSpanData()`.
 */
export function markSpanForOtelSourceInference(span: Span): void {
  addNonEnumerableProperty(span, OTEL_SOURCE_INFERENCE_SPAN_FIELD, true);
}

/** Whether a span is marked for OTel-style `sentry.source` inference (see {@link markSpanForOtelSourceInference}). */
export function spanShouldInferOtelSource(span: Span): boolean {
  return (span as SpanWithOtelSourceInference)[OTEL_SOURCE_INFERENCE_SPAN_FIELD] === true;
}
