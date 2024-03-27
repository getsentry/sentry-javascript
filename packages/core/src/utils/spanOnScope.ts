import type { Scope, Span } from '@sentry/types';
import { addNonEnumerableProperty } from '@sentry/utils';

const SCOPE_SPAN_FIELD = '_sentrySpan';

type ScopeWithMaybeSpan = Scope & {
  [SCOPE_SPAN_FIELD]?: Span;
};

/**
 * Set the active span for a given scope.
 * NOTE: This should NOT be used directly, but is only used internally by the trace methods.
 */
export function _setSpanForScope(scope: Scope, span: Span | undefined): void {
  if (span) {
    addNonEnumerableProperty(scope as ScopeWithMaybeSpan, SCOPE_SPAN_FIELD, span);
  } else {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete (scope as ScopeWithMaybeSpan)[SCOPE_SPAN_FIELD];
  }
}

/**
 * Get the active span for a given scope.
 * NOTE: This should NOT be used directly, but is only used internally by the trace methods.
 */
export function _getSpanForScope(scope: ScopeWithMaybeSpan): Span | undefined {
  return scope[SCOPE_SPAN_FIELD];
}
