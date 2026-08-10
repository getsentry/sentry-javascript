import type { Scope } from '../scope';
import type { Span } from '../types/span';
import { addNonEnumerableProperty } from '../utils/object';
import { derefWeakRef, makeWeakRef, type MaybeWeakRef } from '../utils/weakRef';

const SCOPE_ON_START_SPAN_FIELD = '_sentryScope';
const ISOLATION_SCOPE_ON_START_SPAN_FIELD = '_sentryIsolationScope';

// Brand marking a span created by the `SentryTracerProvider` (i.e. via the OTel tracer) rather than
// directly through the core span API. Such a span is handed to OTel instrumentations as an OTel span,
// so it must become immutable after `end()` like a real OTel SDK span (see `SentrySpan.end()`). Spans
// created directly through core (e.g. the browser SDK) are not branded and stay mutable.
const TRACER_PROVIDER_SPAN_FIELD = Symbol.for('sentry.tracerProviderSpan');

type SpanWithScopes = Span & {
  [SCOPE_ON_START_SPAN_FIELD]?: Scope;
  [ISOLATION_SCOPE_ON_START_SPAN_FIELD]?: MaybeWeakRef<Scope>;
};

type SpanWithTracerProviderBrand = Span & {
  [TRACER_PROVIDER_SPAN_FIELD]?: boolean;
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
 * Mark a span as created by the `SentryTracerProvider` (via the OTel tracer). Set by `SentryTracer`
 * on every span it creates; read by `SentrySpan.end()` to seal the span against further writes once
 * it has ended, mirroring OTel SDK spans (which are immutable after `end()`).
 *
 * TODO???
 */
export function markSpanAsTracerProviderSpan(span: Span): void {
  addNonEnumerableProperty(span, TRACER_PROVIDER_SPAN_FIELD, true);
}

/** Whether a span was created by the `SentryTracerProvider` (see {@link markSpanAsTracerProviderSpan}). */
export function spanIsTracerProviderSpan(span: Span): boolean {
  return (span as SpanWithTracerProviderBrand)[TRACER_PROVIDER_SPAN_FIELD] === true;
}
