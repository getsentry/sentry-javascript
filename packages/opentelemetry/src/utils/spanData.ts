import type { Span } from '@opentelemetry/api';
import type { Scope, TransactionMetadata } from '@sentry/types';

import type { AbstractSpan } from '../types';

// We store the parent span, scopes & metadata in separate weakmaps, so we can access them for a given span
// This way we can enhance the data that an OTEL Span natively gives us
// and since we are using weakmaps, we do not need to clean up after ourselves
const SpanScopes = new WeakMap<
  AbstractSpan,
  {
    scope: Scope;
    isolationScope: Scope;
  }
>();
const SpanParent = new WeakMap<AbstractSpan, Span>();
const SpanMetadata = new WeakMap<AbstractSpan, Partial<TransactionMetadata>>();

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

/**
 * Set the Sentry scope to be used for finishing a given OTEL span.
 * This is different from `setCapturedScopesOnSpan`, as that works on _sentry_ spans,
 * while here we are basically "caching" this on the otel spans.
 */
export function setSpanScopes(
  span: AbstractSpan,
  scopes: {
    scope: Scope;
    isolationScope: Scope;
  },
): void {
  SpanScopes.set(span, scopes);
}

/** Get the Sentry scopes to use for finishing an OTEL span. */
export function getSpanScopes(span: AbstractSpan):
  | {
      scope: Scope;
      isolationScope: Scope;
    }
  | undefined {
  return SpanScopes.get(span);
}
