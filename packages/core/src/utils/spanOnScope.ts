import type { Scope } from '../scope';
import type { Span } from '../types/span';
import { derefWeakRef, makeWeakRef, type MaybeWeakRef } from './weakRef';

const SCOPE_SPAN_FIELD = 'span';

/**
 * Set the active span for a given scope.
 * NOTE: This should NOT be used directly, but is only used internally by the trace methods.
 */
export function _setSpanForScope(scope: Scope, span: Span | undefined): void {
  if (span) {
    // Use WeakRef to avoid circular reference with span holding scope
    scope.refs[SCOPE_SPAN_FIELD] = makeWeakRef(span);
  } else {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete scope.refs[SCOPE_SPAN_FIELD];
  }
}

/**
 * Get the active span for a given scope.
 * NOTE: This should NOT be used directly, but is only used internally by the trace methods.
 */
export function _getSpanForScope(scope: Scope): Span | undefined {
  return derefWeakRef(scope.refs[SCOPE_SPAN_FIELD] as MaybeWeakRef<Span> | undefined);
}
