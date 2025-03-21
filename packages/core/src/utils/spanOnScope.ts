import type { Scope } from '../scope';
import type { Span } from '../types-hoist';

const SCOPE_TO_SPAN_MAP = new WeakMap<Scope, Span>();

/**
 * Set the active span for a given scope.
 * NOTE: This should NOT be used directly, but is only used internally by the trace methods.
 */
export function _setSpanForScope(scope: Scope, span: Span | undefined): void {
  if (span) {
    SCOPE_TO_SPAN_MAP.set(scope, span);
  } else {
    SCOPE_TO_SPAN_MAP.delete(scope);
  }
}

/**
 * Get the active span for a given scope.
 * NOTE: This should NOT be used directly, but is only used internally by the trace methods.
 */
export function _getSpanForScope(scope: Scope): Span | undefined {
  return SCOPE_TO_SPAN_MAP.get(scope);
}
