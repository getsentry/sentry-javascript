import type { Scope } from '../scope';
import type { Span } from '../types-hoist';

const SPAN_TO_SCOPE_MAP = new WeakMap<Span, Scope>();
const SPAN_TO_ISOLATION_SCOPE_MAP = new WeakMap<Span, Scope>();

/** Store the scope & isolation scope for a span, which can the be used when it is finished. */
export function setCapturedScopesOnSpan(span: Span | undefined, scope: Scope, isolationScope: Scope): void {
  if (span) {
    SPAN_TO_SCOPE_MAP.set(span, scope);
    SPAN_TO_ISOLATION_SCOPE_MAP.set(span, isolationScope);
  }
}

/**
 * Grabs the scope and isolation scope off a span that were active when the span was started.
 */
export function getCapturedScopesOnSpan(span: Span): { scope?: Scope; isolationScope?: Scope } {
  return {
    scope: SPAN_TO_SCOPE_MAP.get(span),
    isolationScope: SPAN_TO_ISOLATION_SCOPE_MAP.get(span),
  };
}
